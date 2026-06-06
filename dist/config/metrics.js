"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registry = exports.httpRequestTotal = exports.httpRequestDuration = void 0;
const prom_client_1 = __importDefault(require("prom-client"));
const registry = new prom_client_1.default.Registry();
exports.registry = registry;
prom_client_1.default.collectDefaultMetrics({ register: registry });
exports.httpRequestDuration = new prom_client_1.default.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [registry],
});
exports.httpRequestTotal = new prom_client_1.default.Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [registry],
});
