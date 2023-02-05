import {Dispatch, SetStateAction, useEffect, useMemo, useState} from "react";
import {BufferSliceSet} from "./buffer";

export type PaginationBufferState<T> = {
    buffer: BufferSliceSet<T>

    bufferModCount: number
    setBufferModCount: Dispatch<SetStateAction<number>>

    page: number
    setPage: Dispatch<SetStateAction<number>>

    terminal: number | null
    setTerminal: Dispatch<SetStateAction<number | null>>

    direction: number
    sinceQueryModCount: number
}

export type UsePaginationBufferStateProps = {
    query: string
    initialPage: number
    pageBufferRadius: number
    pageSize: number
    queryBackstackSize: number

    onBufferCreated?(query: string)
    onBufferDestroyed?(query: string)
    onBufferRadiusReduced?(offset: number, terminal: number)
}

export type UsePaginationBufferStateReturn<T> = {
    state: PaginationBufferState<T>
    queryModCount: number
}

export default function usePaginationBufferState<T>(
    props: UsePaginationBufferStateProps
): UsePaginationBufferStateReturn<T> {
    const {
        query,
        pageSize,
        initialPage,
        pageBufferRadius, // could be infinity
        queryBackstackSize, // could be infinity

        onBufferCreated,
        onBufferDestroyed,
        onBufferRadiusReduced
    } = props;

    const [, forceUpdate] = useState(0);
    const [queryModCount, setQueryModCount] = useState(0);

    const states = useMemo(() => new Map<any, PaginationBufferState<T>>(), []);

    let state = states.get(query);

    if (state == null) {
        onBufferCreated?.(query);
        state = {
            sinceQueryModCount: queryModCount,
            direction: 0,
            buffer: new BufferSliceSet<T>(),
            bufferModCount: 0,
            setBufferModCount(fn) {
                state!.bufferModCount = performSetStateAction(state!.bufferModCount, fn);
                forceUpdate(it => it + 1);
            },
            page: initialPage,
            setPage(fn) {
                const currentPage = state!.page;
                const page = performSetStateAction(state!.page, fn);
                state!.page = page;
                state!.direction = page - currentPage;
                forceUpdate(it => it + 1);
            },
            terminal: null,
            setTerminal(fn) {
                state!.terminal = performSetStateAction(state!.terminal, fn);
                forceUpdate(it => it + 1);
            }
        };
        states.set(query, state);
    }

    useEffect(() => {
        if (queryBackstackSize == Infinity)
            return;

        setQueryModCount(it => {
            const newQueryModCount = it + 1;
            state!.sinceQueryModCount = newQueryModCount;
            states.forEach((value, key) => {
                if (Object.is(state, value))
                    return;
                if (newQueryModCount - value.sinceQueryModCount > queryBackstackSize) {
                    onBufferDestroyed?.(query);
                    states.delete(key);
                }
            });
            return newQueryModCount;
        });
    }, [query, queryBackstackSize]);

    useEffect(() => {
        if (pageBufferRadius == Infinity)
            return;

        const terminal = state!.terminal ?? Infinity;
        const pageOffset = state!.page * pageSize;
        const pageTerminal = Math.min(pageOffset + pageSize, terminal);

        const paddingRadius = pageBufferRadius * pageSize;
        const paddingBehind = Math.min(pageOffset, paddingRadius);
        const paddingAhead = Math.min(terminal - pageTerminal, paddingRadius);

        const offset = pageOffset - paddingBehind;
        const length = pageSize + paddingBehind + paddingAhead;

        onBufferRadiusReduced?.(offset, offset + length);

        state!.buffer.optimize(offset, length);
    }, [query, pageBufferRadius, pageSize, state.bufferModCount]);

    return {state, queryModCount};
}

function performSetStateAction<T>(current: T, fn: SetStateAction<T>): T {
    // @ts-ignore
    return typeof fn == "function" ? fn(current) : fn;
}
