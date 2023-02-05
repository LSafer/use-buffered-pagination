import {useMemo, useState} from "react";
import useBufferedPagination, {BufferSlice} from "./src";

export function Component() {
    const data = [...Array(1_000)].map((_, index) => index);
    const [query, setQuery] = useState("");
    const dataFilteredByQuery = useMemo(() => {
        return data.filter(it => `${it}`.endsWith(query));
    }, [query]);
    const pagination = useBufferedPagination<number>({
        query,
        // fetchTimeout: 5_000,
        async fetch({direction, offset, length}) {
            await new Promise(resolve => setTimeout(resolve, 2_000));

            const paddingBehind = direction < 0 ? 15 : 0;
            const paddingAhead = direction > 0 ? 15 : 0;

            const i = Math.max(0, offset - paddingBehind);
            const j = offset + length + paddingAhead;

            const slice = new BufferSlice(
                i, dataFilteredByQuery.slice(i, j)
            );

            const remaining = slice.terminal >= dataFilteredByQuery.length ?
                dataFilteredByQuery.length - offset : undefined;

            console.log("fetched", {slice, remaining});

            return {
                // remaining: data.length - offset - length,
                remaining,
                slices: [slice]
            };
        },
        logger(type, message) {
            console.log(`[${type.toUpperCase()}]:`, message());
        }
    });

    return <div style={{padding: "5rem"}}>
        {/* Query Input */}
        <input
            style={{marginRight: "1rem"}}
            value={query}
            onChange={e => setQuery(e.target.value)}
        />

        {/* Page Size Input */}
        <input
            style={{marginRight: "1rem", width: "5rem", appearance: "meter"}}
            type="number"
            value={pagination.pageSize}
            onChange={e => {
                pagination.setPageSize(parseInt(e.target.value));
            }}
        />

        {/* Previous Page Button */}
        <button style={{marginRight: "1rem"}} onClick={() => pagination.setPage(it => it - 1)}>
            &lt; Previous
        </button>

        {/* Page Input */}
        <input
            style={{marginRight: ".5rem", width: "2rem"}}
            value={pagination.page}
            onChange={e => {
                pagination.setPage(parseInt(e.target.value));
            }}
        />
        /
        {pagination.pageCount}

        {/* Next Page Button */}
        <button style={{marginLeft: "1rem"}} onClick={() => pagination.setPage(it => it + 1)}>
            Next &gt;
        </button>

        <br />

        {/* Loading Data */}
        {pagination.loading ? "Loading..." : ""}
        {pagination.sequential ? "" : "data is not sequential, yet"}

        {/* Absent Ranges */}
        {pagination.absence.map((it, index) => (
            <div key={index}>
                Absence At: {it.offset} {it.length}
            </div>
        ))}

        <br />
        <br />

        {/* The Data */}
        {pagination.data.map((it, index) =>
            <div key={index} style={{
                background: it == pagination.page * pagination.pageSize + index ? "lime" : "red"
            }}>
                n: {it}
            </div>
        )}

        <br />

        {/* Insert Fake Button */}
        <button onClick={() => {
            const offset = pagination.page * pagination.pageSize;
            pagination.insert({
                slices: [
                    new BufferSlice(offset, [2])
                ]
            });
        }}>
            Insert Fake with current offset
        </button>
    </div>;
}
