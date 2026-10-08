export declare const PEOPLE_INDEXES: readonly [{
    readonly key: {
        readonly id: 1;
    };
    readonly unique: true;
}, {
    readonly key: {
        readonly code: 1;
    };
    readonly unique: true;
    readonly sparse: true;
}, {
    readonly key: {
        readonly terr: 1;
    };
}, {
    readonly key: {
        readonly expertId: 1;
    };
    readonly sparse: true;
}, {
    readonly key: {
        readonly name: 1;
    };
}, {
    readonly key: {
        readonly status: 1;
        readonly terr: 1;
    };
}];
