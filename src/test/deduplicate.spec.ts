import assert from "assert";
import {describe, it} from "mocha";
import {BufferSlice, BufferSliceSet} from "../buffer";

describe("BufferSlice", () => {
    describe("#trySlice", () => {
        it("should only return something when is within the range", () => {
            const slice0 = new BufferSlice(250, [...Array(26)]);
            const slice1 = new BufferSlice(230, [...Array(10)]);
            const slice2 = new BufferSlice(250, [...Array(26)]);

            const buffer = new BufferSliceSet();

            buffer.insert(slice0, slice1, slice2);

            buffer.deduplicate();
            assert.deepEqual(buffer["slices"], [slice0, slice1]);
        });
    });
});

describe("Buffer", () => {
    describe("#deduplicate", () => {
        it("should deduplicate same range items", () => {
            const buffer = new BufferSliceSet<string>();

            const slice0 = new BufferSlice(0, ["A", "B", "C"]);
            const slice1 = new BufferSlice(0, ["D", "E", "F"]);

            buffer.insert(slice0, slice1);

            buffer.deduplicate();

            assert.deepEqual(buffer["slices"], [slice1]);
        });

    });
});
