import http from "http";
import { logger } from "../utils/logger";
import { Registry } from "prom-client";

export const bootPrometheusScrapper = (
  port: number,
  registry: Registry
): void => {
  const server = http.createServer(async (req, res) => {
    if (req.url !== "/metrics") {
      res.statusCode = 404;
      return res.end("Not Found");
    }
    try {
      res.setHeader("Content-Type", registry.contentType);
      res.end(await registry.metrics());
    } catch (err) {
      res.statusCode = 500;
      res.end("Error collecting metrics");
    }
  });

  server.listen(port, () => {
    logger.info(`Worker metrics exposed on :${port}/metrics`);
  });
};
