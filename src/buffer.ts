/**
 * A buffer subset that all its data
 * exists with no absence whatsoever.
 */
type SequentialBufferSliceSubset<T> = {
    /**
     * Indicates that this subset is sequential.
     */
    readonly sequential: true
    /**
     * Always an empty array.
     */
    readonly absence: ReadonlyArray<Range>
    /**
     * The subset's data.
     */
    readonly data: ReadonlyArray<T>
}

/**
 * A buffer subset that some of its
 * data doesn't exist.
 */
type NonSequentialBufferSliceSubset<T> = {
    /**
     * Indicates that this subset is not sequential.
     */
    readonly sequential: false
    /**
     * An array containing the absent ranges.
     */
    readonly absence: ReadonlyArray<Range>
    /**
     * Some of the subset's data
     * with the missing items set
     * to `undefined`.
     */
    readonly data: ReadonlyArray<T | undefined>
}

/**
 * A buffer subset that contains the
 * data at some range of the buffer
 * with potentially missing data.
 */
export type BufferSliceSubset<T> = SequentialBufferSliceSubset<T> | NonSequentialBufferSliceSubset<T>

/**
 * A common container for a range in some buffer.
 */
export class Range {
    constructor(
        /**
         * The first index of the range.
         *
         * Must not be negative.
         */
        readonly offset: number,
        /**
         * The range's length.
         *
         * Must not be negative.
         */
        readonly length: number
    ) {
        checkOffsetAndLength("Range", offset, length);
    }

    /**
     * One past the last index of this range.
     */
    get terminal() {
        return this.offset + this.length;
    }
}

/**
 * An immutable buffer slice with an offset.
 */
export class BufferSlice<T> {
    constructor(
        /**
         * The offset of the slice.
         *
         * Must not be negative.
         */
        readonly offset: number,
        /**
         * The data of the slice.
         *
         * Will not create defencive copy.
         * Do not pass data that could change.
         */
        readonly data: ReadonlyArray<T>
    ) {
        checkOffset("BufferSlice", offset);
    }

    /**
     * The range of this slice.
     */
    public get range(): Range {
        return new Range(this.offset, this.length);
    }

    /**
     * The number of items this slice holds.
     */
    public get length() { return this.data.length; }

    /**
     * One past the last index of this slice.
     */
    public get terminal() { return this.offset + this.length; }

    /**
     * Try produce a new sequential slice
     * from this slice and the given {@link slice}.
     *
     * In case of collision. This slice have precedence.
     *
     * @return a new slice containing the result.
     *         Or `null` if the two buffers aren't sequential.
     * @internal
     */
    tryJoin(slice: BufferSlice<T>): BufferSlice<T> | null {
        const [i, j, ij, s, e, se] = [
            this.offset, this.terminal, this.data,
            slice.offset, slice.terminal, slice.data
        ];

        if (j < s || e < i)
            return null;

        const si = se.slice(0, Math.max(0, i - s));
        const je = se.slice(Math.max(j - s));

        return new BufferSlice(
            i - si.length, [
                ...si,
                ...ij,
                ...je
            ]
        );
    }

    /**
     * Try produce a new slice that is within
     * the given {@link offset} and {@link length}.
     *
     * @param offset the offset to slice from. (Must not be negative)
     * @param length the size of the slice. (Must not be negative, can be Infinity)
     * @return a new slice containing the result.
     *         Or `null` if this slice isn't within the given range.
     * @internal
     */
    trySlice(offset: number, length: number): BufferSlice<T> | null {
        checkOffsetAndLength("BufferSlice.trySlice(...)", offset, length);

        // NOTE: length maybe Infinity

        const [i, j, ij, s, e] = [
            this.offset, this.terminal, this.data,
            offset, offset + length
        ];

        if (j <= s || e <= i)
            return null;

        const isL = Math.max(0, s - i);
        const ieL = Math.max(0, e - i);

        return new BufferSlice(
            i + isL,
            ij.slice(isL, ieL)
        );
    }

    /**
     * Try splitting this buffer at the given `offsets`.
     *
     * The result will be the same length as the
     * given `offsets` plus one.
     *
     * @param offsets
     * @internal
     */
    trySplit(...offsets: number[]): (BufferSlice<T> | null)[] {
        offsets.forEach(it => checkOffset("BufferSlice.trySplit(...)", it));

        if (offsets.length == 0)
            return [this];

        const [i, j] = [this.offset, this.terminal];
        const out: (BufferSlice<T> | null)[] = [];
        for (let n = -1; n < offsets.length; n++) {
            const s = offsets[n] ?? 0;
            const e = offsets[n + 1] ?? Infinity;

            if (s <= i && j <= e) {
                // optimization, return this instead of slicing
                out.push(this);
            } else {
                out.push(this.trySlice(s, e - s));
            }
        }
        return out;
    }
}

/**
 * A buffer that uses multiple buffer slices to back it.
 */
export class BufferSliceSet<T> {
    /**
     * The backing slices.
     */
    private readonly slices: BufferSlice<T>[] = [];

    /**
     * The smallest offset in the backing slices. (non-negative)
     *
     * Returns zero if no backing slices.
     */
    get offset(): number {
        return Math.min(0, ...this.slices.map(it => it.offset));
    }

    /**
     * The biggest terminal in the backing slices. (non-negative)
     *
     * Returns zero if no backing slices.
     */
    get terminal(): number {
        return Math.max(0, ...this.slices.map(it => it.terminal));
    }

    /**
     * Insert the given {@link slices}.
     */
    public insert(...slices: BufferSlice<T>[]) {
        this.slices.push(...slices.filter(it => it.length));
    }

    /**
     * Get subset from this buffer that starts at
     * the given `offset` and have the given `length`.
     */
    public subset(offset: number, length: number): BufferSliceSubset<T> {
        checkOffsetAndLength("BufferSliceSet.subset(...)", offset, length);

        this.deduplicate();

        const terminal = offset + length;
        const slices: BufferSlice<T>[] = [];

        for (const buffer of this.slices) {
            const subSlice = buffer.trySlice(offset, length);

            if (subSlice != null) {
                slices.push(subSlice);
            }
        }

        slices.sort((a, b) => a.offset - b.offset);

        const data: (T | undefined)[] = [];
        const absence: Range[] = [];

        let absentOffset = offset;

        for (const slice of slices) {
            const absentLength = slice.offset - absentOffset;

            if (absentLength) {
                data.fill(undefined, absentOffset - offset, absentLength);
                absence.push(new Range(absentOffset, absentLength));
            }

            data.push(...slice.data);
            absentOffset = slice.terminal;
        }

        // should be tested, was absentOffset != terminal
        if (absentOffset != terminal) {
            const absentLength = terminal - absentOffset;
            data.fill(undefined, absentOffset - offset, absentLength);
            absence.push(new Range(absentOffset, absentLength));
        }

        if (absence.length) {
            return {
                sequential: false,
                absence,
                data
            };
        } else {
            return {
                sequential: true,
                absence: [],
                data: data as T[]
            };
        }
    }

    /**
     * Optimize this buffer by removing any items that
     * doesn't exist within the given `offset` and `length`.
     *
     * The exact behaviour is not defined and the caller
     * should only expect the items that are in the range
     * be available and the items that aren't might be
     * partially or entirely missing.
     *
     * @param offset the offset to optimize from.
     * @param length the length of the optimization range
     */
    public optimize(offset: number, length: number) {
        checkOffsetAndLength("BufferSliceSet.optimize(...)", offset, length);

        this.deduplicate();
        this.fragment(offset, length);
        this.deallocate(offset, length);
    }

    /**
     * Remove all the slices in the buffer.
     */
    public clear() {
        this.slices.splice(0);
    }

    /**
     * Split any slice part that exists within
     * `offset` and `length` to multiple slices
     * where the items that exist within the range
     * get moved to a single slice and the items that
     * don't get moved to different slices.
     */
    fragment(offset: number, length: number) {
        const terminal = offset + length;
        for (let i = 0; i < this.slices.length; i++) {
            const buffer = this.slices[i];

            const fragments = buffer.trySplit(offset, terminal);

            if (fragments[1] != null) {
                const nonNullFragments =
                    fragments.filter(it => it != null) as BufferSlice<T>[];

                if (nonNullFragments.length > 1) {
                    this.slices.splice(i, 1);
                    this.slices.push(...nonNullFragments);
                }
            }
        }
    }

    /**
     * Deallocate any buffer that does not hold any item
     * within the given `offset` and `length`
     *
     * @internal
     */
    deallocate(offset: number, length: number) {
        const terminal = offset + length;
        for (let i = 0; i < this.slices.length;) {
            const buffer = this.slices[i];

            if (buffer.terminal <= offset || buffer.offset >= terminal) {
                this.slices.splice(i, 1);
                continue;
            }

            i++;
        }
    }

    /**
     * Reduce the slices count by joining the slices
     * that have same items.
     * The newer slices takes precedence.
     *
     * @internal
     */
    deduplicate() {
        for (let i = 0; i < this.slices.length; i++) {
            const ib = this.slices[i];

            for (let j = i + 1; j < this.slices.length;) {
                const jb = this.slices[j];

                const ijb = jb.tryJoin(ib);

                if (ijb != null) {
                    this.slices[i] = ijb;
                    this.slices.splice(j, 1);
                    continue;
                }

                j++;
            }
        }
    }

    /**
     * If possible, return a single slice
     * that contains all the data in the buffer
     * set.
     *
     * This will return `null` if the slices
     * aren't sequential.
     *
     * @deprecated
     */
    single(): BufferSlice<T> | null {
        this.deduplicate();
        if (this.slices.length == 1)
            return this.slices[0];
        return null;
    }
}

/**
 * A readonly view of a {@link BufferSliceSet}.
 */
export class BufferSliceSetView<T> {
    constructor(
        private readonly buffer: BufferSliceSet<T>
    ) {}

    /**
     * The smallest offset in the backing slices. (non-negative)
     *
     * Returns zero if no backing slices.
     */
    get offset(): number {
        return this.buffer.offset;
    }

    /**
     * The biggest terminal in the backing slices. (non-negative)
     *
     * Returns zero if no backing slices.
     */
    get terminal(): number {
        return this.buffer.terminal;
    }

    /**
     * Get subset from this buffer that starts at
     * the given `offset` and have the given `length`.
     */
    public subset(offset: number, length: number): BufferSliceSubset<T> {
        return this.buffer.subset(offset, length);
    }
}

function checkOffsetAndLength(title: string, offset: number, length: number) {
    if (offset < 0 || length < 0) {
        throw new Error(`${title} cannot accept negative offset or length, got: ${offset}, ${length}`);
    }
}

function checkOffset(title: string, offset: number) {
    if (offset < 0) {
        throw new Error(`${title} cannot accept negative offset, got: ${offset}`);
    }
}
