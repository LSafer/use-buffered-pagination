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
            // the first index of the needed items
            params.offset;
            // the number of needed items
            params.length;
            // negative if the user is paginating backwards 
            // and positive when paginating forwards 
            params.direction;
            // the list of other ranges including (offset, length) to be fetch (if possible)
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
