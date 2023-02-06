import {Dispatch, SetStateAction, useEffect, useMemo, useState} from "react";
import {BufferSlice, Range} from "./buffer";
import usePaginationBufferState from "./usePaginationBufferState";
import useTimeoutDispatch from "./useTimeoutDispatch";

type PaginationLogType = "Buffer" | "Dispatch" | "Info"
type PaginationLogger = (type: PaginationLogType, message: () => string) => void;

const DEFAULT_PAGE_SIZE = 15;
const DEFAULT_PAGE_BUFFER_RADIUS = 1;
const DEFAULT_QUERY_BACKSTACK_SIZE = 1;
const DEFAULT_FETCH_TIMEOUT = 1_000;

export type PaginationData<T> = {
    /**
     * Slices of fetched data.
     */
    readonly slices?: ReadonlyArray<BufferSlice<T>> | null
    /**
     * The remaining items from the greatest
     * terminal offset of {@link slices}`.
     *
     * This value can be negative.
     */
    readonly remaining?: number | null
}

export type PaginationFetchParams = {
    /**
     * The user pagination direction.
     *
     * - positive: paginating forwards
     * - negative: paginating backwards
     * - zero, undefined: unknown
     */
    readonly direction: number
    /**
     * The currently known items count. {@link Infinity} if still unknown.
     */
    readonly count: number
    /**
     * The first range.
     */
    readonly range: Range
    /**
     * The first range with padding.
     */
    readonly paddedRange: Range
    /**
     * The ranges to be fetched.
     */
    readonly ranges: ReadonlyArray<Range>
}

export type UseBufferedPaginationProps<T> = {
    // Variables

    /**
     * The key to change the pagination state based on.
     * The pagination state of any query will be saved
     * until the query changes number of times that
     * equals {@link queryBackstackSize} then it will be
     * forgotten.
     *
     * @default null
     */
    readonly query?: any
    /**
     * The known count.
     *
     * This value must not be negative.
     *
     * When this is not set, the count will be
     * considered {@link Infinity} until the first
     * a {@link PaginationData.remaining} is provided.
     */
    readonly count?: number
    /**
     * The initial page. (used on first render of each query)
     *
     * This value must not be negative.
     *
     * @default 0
     */
    readonly page?: number
    /**
     * The page size to be used. (used on first render only)
     *
     * This value must be positive.
     *
     * @default 15
     */
    readonly pageSize?: number

    // Optimization

    /**
     * The number of pages allowed to be buffered at the same time.
     *
     * This value must not be negative.
     *
     * Increasing this will keep the data of the pages
     * near the current page.
     *
     * Decreasing this will save memory.
     *
     * It is allowed to be set to {@link Infinity}.
     *
     * @default 1
     */
    readonly pageBufferRadius?: number
    /**
     * The number of query states allowed to be retained
     * at a time.
     *
     * This value must not be negative.
     *
     * Increasing this will keep the data of the previously
     * visited queries.
     *
     * Decreasing this will save memory.
     *
     * @default 1
     */
    readonly queryBackstackSize?: number
    /**
     * The timeout between each fetch. (in milliseconds)
     *
     * This value must not be negative.
     *
     * The hook will insure this timeout
     * between every fetch.
     *
     * @default 1000
     */
    readonly fetchTimeout?: number

    // Customization

    /**
     * An optional logger.
     */
    readonly logger?: PaginationLogger

    // Implementation

    /**
     * A function to be used to fetch more data.
     */
    fetch(params: PaginationFetchParams): Promise<PaginationData<T>>
}

export type BufferedPagination<T> = {
    /**
     * The current page.
     */
    readonly page: number
    /**
     * The current set page size.
     */
    readonly pageSize: number
    /**
     * The count of all available pages. Infinity if unknown
     */
    readonly pageCount: number
    /**
     * The count of all available items. Infinity if unknown.
     */
    readonly count: number

    /**
     * True, if currently loading.
     */
    readonly loading: boolean
    /**
     * True, if all the data is available.
     */
    readonly sequential: boolean
    /**
     * The ranges of the data absent in {@link data}
     */
    readonly absence: ReadonlyArray<Range>
    /**
     * The data of the current page.
     *
     * It will not contain undefined
     * when {@link sequential} is `true`
     */
    readonly data: ReadonlyArray<T | undefined>

    /**
     * Change the page.
     */
    readonly setPage: Dispatch<SetStateAction<number>>
    /**
     * Change the page size.
     */
    readonly setPageSize: Dispatch<SetStateAction<number>>

    /**
     * Reset everything.
     */
    reset(): void

    /**
     * Reset the current page.
     */
    resetCurrent(): void

    /**
     * Refresh the current page.
     */
    refresh(): void

    /**
     * Force the pagination to fetch absent ranges.
     */
    fetchAbsent(): Promise<PaginationData<T>>

    /**
     * Force the pagination to fetch the given ranges
     * then update the pagination buffer with the fetch
     * result.
     *
     * Note: fetching ranges outside the buffer radius
     * will make the fetched items ignored.
     *
     * @param ranges the ranges to fetch.
     * @param direction the pagination direction.
     * @param padding the recommended padding.
     * @return the result of the fetch.
     */
    fetch(ranges: ReadonlyArray<Range>, direction?: number, padding?: number): Promise<PaginationData<T>>

    /**
     * Insert the given data to the pagination buffer.
     */
    insert(data: PaginationData<T>)
}

export default function useBufferedPagination<T>(
    props: UseBufferedPaginationProps<T>
): BufferedPagination<T> {
    const {
        query = null,
        fetch,
        fetchTimeout = DEFAULT_FETCH_TIMEOUT,
        count: initialCount,
        page: initialPage = 0,
        pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
        pageBufferRadius = DEFAULT_PAGE_BUFFER_RADIUS,
        queryBackstackSize = DEFAULT_QUERY_BACKSTACK_SIZE,
        logger
    } = props;

    const [pageSize, setPageSize] = useState(initialPageSize);
    const [pending, setPending] = useState(0);

    const dispatch = useTimeoutDispatch({
        timeout: fetchTimeout,
        onDispatchDelayed: logger && ((dispatch, deltaTime) => {
            logger("Dispatch", () => `Fetch was delayed due to only ${deltaTime} millis has passed since the previous fetch.`);
        }),
        onDispatchIgnored: logger && ((dispatch, deltaCount) => {
            logger("Dispatch", () => `Fetch was ignored due to ${deltaCount} fetches enqueued after it.`);
        })
    });

    const {state, queryModCount, ...bufferState} = usePaginationBufferState<T>({
        query,
        initialPage,
        pageSize,
        queryBackstackSize,
        pageBufferRadius,
        onBufferRadiusReduced: logger && ((offset, terminal) => {
            logger("Buffer", () => `Buffer radius was reduced to: (${offset}, ${terminal})`);
        }),
        onBufferCreated: logger && ((query) => {
            logger("Buffer", () => `Created a new buffer for query: ${query}`);
        }),
        onBufferDestroyed: logger && ((query) => {
            logger("Buffer", () => `Destroyed buffer of query: ${query}`);
        })
    });

    const offset = state.page * pageSize;
    const count = state.terminal ?? initialCount ?? Infinity;
    const pageCount = Math.floor(count / pageSize);

    const subset = useMemo(() => {
        const length = Math.max(0, Math.min(count - offset, pageSize));
        return state.buffer.subset(offset, length);
    }, [pageSize, state.page, state.bufferModCount, queryModCount]);

    useEffect(() => {
        if (!subset.sequential && offset < count /*&& pending <= 0*/) {
            logger?.("Info", () => `Enqueued a fetch dispatch due to data demand`);
            dispatch(() => fetchAbsent());
        }
    }, [pageSize, pending, state.page, state.bufferModCount, queryModCount]);

    async function reset() {
        bufferState.reset();
        setPageSize(initialPageSize);
    }

    async function resetCurrent() {
        state.buffer.clear();
        state.setBufferModCount(it => it + 1);
        state.setTerminal(null);
    }

    async function refresh() {
        const ranges = [new Range(offset, offset + length)];
        await fetchRanges(ranges, state.direction, pageSize * pageBufferRadius);
    }

    async function fetchAbsent() {
        return await fetchRanges(subset.absence, state.direction, pageSize * pageBufferRadius);
    }

    async function fetchRanges(ranges: ReadonlyArray<Range>, direction: number = 0, padding: number = 0) {
        try {
            setPending(it => it + 1);

            const result = await fetch({
                direction,
                count,
                range: ranges[0],
                paddedRange: calculatePaddedRange(ranges[0], direction, padding),
                ranges
            });

            insertPaginationData(result);
            return result;
        } finally {
            setPending(it => it - 1);
        }
    }

    function insertPaginationData(data: PaginationData<T>) {
        if (data.slices) {
            state.buffer.insert(...data.slices);
            state.setBufferModCount(it => it + 1);
        }

        if (data.remaining != null) {
            const terminalOfLastMostSlice = data.slices ? Math.max(0, ...data.slices.map(it => it.terminal)) : 0;
            const terminal = Math.max(0, terminalOfLastMostSlice + data.remaining);
            state.setTerminal(terminal);

            logger?.("Info", () => `The terminal offset was determined to be ${terminal}`);
        }
    }

    return {
        page: state.page,
        pageSize,
        count,
        pageCount,

        loading: !!pending,
        sequential: subset.sequential,
        absence: subset.absence,
        data: subset.data,

        setPage: state.setPage,
        setPageSize,

        reset,
        resetCurrent,
        refresh,
        fetchAbsent,
        fetch: fetchRanges,
        insert: insertPaginationData
    };
}

function calculatePaddedRange(range: Range, direction: number, padding: number) {
    const paddedOffset = direction < 0 ? Math.max(0, range.offset - padding) : range.offset;
    const paddedTerminal = direction > 0 ? range.terminal + padding : range.terminal;
    return new Range(
        paddedOffset,
        paddedTerminal - paddedOffset
    );
}
