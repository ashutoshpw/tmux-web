import express from 'express';
import { runsRouter } from './routes/runs.js';
import { dispatchRouter } from './routes/dispatch.js';
import { workflowsRouter } from './routes/workflows.js';

const app = express();

app.use(express.json());
app.use(workflowsRouter);
app.use(runsRouter);
app.use(dispatchRouter);

const PORT = parseInt(process.env.EXT_PORT ?? '4100', 10);

app.listen(PORT, () => {
  console.log(`[github-actions ext] running on :${PORT}`);
});
