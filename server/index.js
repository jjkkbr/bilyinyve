import { startApiServer } from './apiServer.js';

const port = Number(process.env.API_PORT || 8787);

try {
  await startApiServer({ port });
  console.log(`Local API server running at http://127.0.0.1:${port}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
