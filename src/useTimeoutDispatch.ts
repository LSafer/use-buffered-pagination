import {useCallback, useRef} from "react";

export type Dispatch = () => void

export type UseTimeoutDispatchProps = {
    /**
     * The timeout between each dispatch.
     *
     * The hook will insure this timeout
     * between every dispatch.
     */
    readonly timeout: number
    /**
     * Gets called when dispatch is delayed.
     *
     * @param dispatch the dispatch.
     * @param deltaTime the period from the previous dispatch.
     */
    onDispatchDelayed?(
        dispatch: Dispatch,
        deltaTime: number
    )
    /**
     * Gets called when a dispatch is ignored.
     *
     * @param dispatch the dispatch.
     * @param deltaCount the number of dispatches that
     *                    got enqueued after this dispatch.
     */
    onDispatchIgnored?(
        dispatch: Dispatch,
        deltaCount: number
    )
}

export default function useTimeoutDispatch(props: UseTimeoutDispatchProps) {
    const {
        timeout,
        onDispatchDelayed,
        onDispatchIgnored
    } = props;

    const dispatchTime = useRef(0);
    const dispatchCount = useRef(0);

    return useCallback((dispatch: Dispatch) => {
        const now = Date.now();

        if (timeout > 0) {
            const deltaTime = now - dispatchTime.current;
            const expectedDispatchCount = ++dispatchCount.current;

            if (deltaTime < timeout) {
                onDispatchDelayed?.(dispatch, deltaTime);

                const delay = timeout - deltaTime;

                setTimeout(() => {
                    const deltaCount =
                        dispatchCount.current - expectedDispatchCount;

                    if (deltaCount == 0) {
                        dispatchTime.current = Date.now();
                        dispatch();
                    } else {
                        onDispatchIgnored?.(dispatch, deltaCount);
                    }
                }, delay);

                return;
            }
        }

        dispatchTime.current = now;
        dispatch();
    }, [timeout, onDispatchDelayed, onDispatchIgnored]);
}
