import express from "express";
import { request } from "node:http";
import { Gauge, Registry } from "prom-client";

const dockerSocket = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const port = Number(process.env.DOCKER_STATS_PORT ?? 9101);
const composeProject = process.env.COMPOSE_PROJECT_NAME ?? "backend";

type DockerContainer = {
  Id: string;
  Labels: Record<string, string>;
};

type DockerStats = {
  cpu_stats?: { cpu_usage?: { total_usage?: number } };
  memory_stats?: {
    usage?: number;
    stats?: { inactive_file?: number; total_inactive_file?: number };
  };
};

const registry = new Registry();
const containerMemory = new Gauge({
  name: "shortly_container_memory_working_set_bytes",
  help: "Working set memory used by Shortly Docker Compose services.",
  labelNames: ["service"] as const,
  registers: [registry],
});
const containerCpu = new Gauge({
  name: "shortly_container_cpu_usage_seconds_total",
  help: "Cumulative CPU seconds used by Shortly Docker Compose services.",
  labelNames: ["service"] as const,
  registers: [registry],
});

const dockerGet = <T>(path: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const dockerRequest = request(
      { socketPath: dockerSocket, path, method: "GET" },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (!response.statusCode || response.statusCode >= 400) {
            reject(new Error(`Docker API returned ${response.statusCode}: ${body}`));
            return;
          }

          try {
            resolve(JSON.parse(body) as T);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    dockerRequest.on("error", reject);
    dockerRequest.end();
  });

const collectDockerStats = async (): Promise<void> => {
  const containers = await dockerGet<DockerContainer[]>("/containers/json");
  const shortlyContainers = containers.filter(
    (container) =>
      container.Labels["com.docker.compose.project"] === composeProject,
  );

  containerMemory.reset();
  containerCpu.reset();

  await Promise.all(shortlyContainers.map(async (container) => {
    const service = container.Labels["com.docker.compose.service"];
    if (!service) return;

    const stats = await dockerGet<DockerStats>(
      `/containers/${container.Id}/stats?stream=false&one-shot=true`,
    );
    const usage = stats.memory_stats?.usage ?? 0;
    const inactiveFile = stats.memory_stats?.stats?.inactive_file
      ?? stats.memory_stats?.stats?.total_inactive_file
      ?? 0;
    const cpuNanoseconds = stats.cpu_stats?.cpu_usage?.total_usage ?? 0;

    containerMemory.set({ service }, Math.max(usage - inactiveFile, 0));
    containerCpu.set({ service }, cpuNanoseconds / 1_000_000_000);
  }));
};

const app = express();

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.get("/metrics", async (_request, response) => {
  try {
    await collectDockerStats();
    response.type(registry.contentType).send(await registry.metrics());
  } catch (error) {
    console.error("Unable to collect Docker container stats", error);
    response.status(500).json({ error: "Unable to collect Docker container stats" });
  }
});

app.listen(port, () => {
  console.log(`Docker Stats Exporter listening on port ${port}`);
});
