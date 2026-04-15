"use strict";
/** __createBinding：定义该变量以承载业务值。 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
/** desc：定义该变量以承载业务值。 */
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
/** __setModuleDefault：定义该变量以承载业务值。 */
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
/** __importStar：定义该变量以承载业务值。 */
var __importStar = (this && this.__importStar) || (function () {
/** ownKeys：执行对应的业务逻辑。 */
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
/** ar：定义该变量以承载业务值。 */
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
/** result：定义该变量以承载业务值。 */
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProjectPath = resolveProjectPath;
/** fs：定义该变量以承载业务值。 */
const fs = __importStar(require("fs"));
/** path：定义该变量以承载业务值。 */
const path = __importStar(require("path"));
/** REPO_ROOT_CANDIDATES：定义该变量以承载业务值。 */
const REPO_ROOT_CANDIDATES = [
    process.cwd(),
    path.resolve(__dirname, '../../../..'),
];
/** LEGACY_SERVER_DATA_SEGMENTS：定义该变量以承载业务值。 */
const LEGACY_SERVER_DATA_SEGMENTS = ['legacy', 'server', 'data'];
/** resolveRepoRoot：执行对应的业务逻辑。 */
function resolveRepoRoot() {
    for (const candidate of REPO_ROOT_CANDIDATES) {
        if (fs.existsSync(path.join(candidate, 'packages'))) {
            return candidate;
        }
    }
    return REPO_ROOT_CANDIDATES[0];
}
/** resolveLegacyServerDataPath：执行对应的业务逻辑。 */
function resolveLegacyServerDataPath(repoRoot, segments) {
    if (segments[0] !== 'packages' || segments[1] !== 'server' || segments[2] !== 'data') {
        return null;
    }
    return path.join(repoRoot, ...LEGACY_SERVER_DATA_SEGMENTS, ...segments.slice(3));
}
/** resolveProjectPath：执行对应的业务逻辑。 */
function resolveProjectPath(...segments) {
    const repoRoot = resolveRepoRoot();
    const directPath = path.join(repoRoot, ...segments);
    if (fs.existsSync(directPath)) {
        return directPath;
    }
    const legacyServerDataPath = resolveLegacyServerDataPath(repoRoot, segments);
    if (legacyServerDataPath) {
        return legacyServerDataPath;
    }
    return directPath;
}
//# sourceMappingURL=project-path.js.map
