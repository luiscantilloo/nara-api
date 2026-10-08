"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PEOPLE_INDEXES = void 0;
exports.PEOPLE_INDEXES = [
    { key: { id: 1 }, unique: true },
    { key: { code: 1 }, unique: true, sparse: true },
    { key: { terr: 1 } },
    { key: { expertId: 1 }, sparse: true },
    { key: { name: 1 } },
    { key: { status: 1, terr: 1 } },
];
//# sourceMappingURL=schema.js.map