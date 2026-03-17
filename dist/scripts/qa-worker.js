"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// scripts/qa-worker.ts
require("dotenv/config");
var queue_1 = require("../lib/queue");
var store_1 = require("../lib/store");
var openai_edge_1 = require("openai-edge");
// Worker to continuously process QA jobs from the queue
function handleJob() {
    return __awaiter(this, void 0, void 0, function () {
        var job, jobId, images, configuration, openai, messages, i, i, resp, text, report, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    job = (0, queue_1.dequeueJob)();
                    if (!job)
                        return [2 /*return*/]; // no jobs to process
                    jobId = job.jobId, images = job.images;
                    (0, store_1.setJobStatus)(jobId, "PROCESSING");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    configuration = new openai_edge_1.Configuration({
                        apiKey: process.env.OPENAI_API_KEY,
                    });
                    openai = new openai_edge_1.OpenAIApi(configuration);
                    messages = [
                        {
                            role: "system",
                            content: "You are a 3D QA specialist. Compare the live screenshots to the reference images and output only JSON with differences.",
                        },
                    ];
                    // Add the 4 live screenshots
                    for (i = 0; i < 4; i++) {
                        messages.push({
                            role: "user",
                            content: "Live screenshot ".concat(i + 1, ":\n").concat(images[i]),
                        });
                    }
                    // Add the 4 reference images
                    for (i = 4; i < 8; i++) {
                        messages.push({
                            role: "user",
                            content: "Reference image ".concat(i - 3, ":\n").concat(images[i]),
                        });
                    }
                    return [4 /*yield*/, openai.createChatCompletion({
                            model: "gpt-4-vision-preview",
                            messages: messages,
                            temperature: 0,
                        })];
                case 2:
                    resp = _a.sent();
                    return [4 /*yield*/, resp.text()];
                case 3:
                    text = _a.sent();
                    report = JSON.parse(text);
                    (0, store_1.setJobResult)(jobId, report);
                    return [3 /*break*/, 5];
                case 4:
                    err_1 = _a.sent();
                    console.error("Job ".concat(jobId, " failed:"), err_1);
                    (0, store_1.setJobError)(jobId, err_1.message || "Unknown error");
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Poll the queue every second
setInterval(handleJob, 1000);
