# use-buffered-pagination

React hook to achieve memory-efficient buffered pagination

#### Showcase

```tsx
function Component() {
    const [searchQuery, setSearchQuery] = useState("");

    const pagination = useBufferedPagination<number>({
        query: searchQuery, // a buffer will be created for every different query
        count: undefined, // if not set, will be calculated after fetching
        page: 0, // the initial page for the current query
        pageSize: 0, // the initial page size
        pageBufferRadius: 1, // the radius of the buffer
        queryBackstackSize: 1, // how many query buffers can be retain at once
        async fetch(params) {
            // the first (default) range to fetch
            params.range;
            // the first range with padding
            params.paddedRange;
            // the currently known items count
            params.count;
            // negative if the user is paginating backwards 
            // and positive when paginating forwards 
            params.direction;
            // the list of all the ranges to be fetch (if possible)
            params.ranges;

            const [dataOffset, data] = myFetchFunction(params);

            return {
                remaining, // the remaining items, can be omitted or be a negative value
                slices: [
                    new BufferSlice(dataOffset, data)
                    // it is allowed to pass more than one slice
                    // the slices will be joind and arranged 
                    // depending on the offset of each slice
                ]
            };
        }
    });

    // page control
    pagination.page;
    pagination.setPage;
    pagination.pageSize;
    pagination.setPageSize;

    // data
    pagination.count;
    pagination.pageCount;
    pagination.loading;
    pagination.sequential; // if all the items is available
    pagination.absence; // the absent ranges in the data
    pagination.data;

    pagination.fetch(/* ... */); // force the hook to fetch some range
    pagination.insert(/* ... */); // insert data directly to the hook

    return <></>;
}
```
