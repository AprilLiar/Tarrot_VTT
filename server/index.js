import { createDb, initSchema } from './db.js';
import { createServer } from './app.js';

const db = createDb();
await initSchema(db);

const { httpServer } = createServer({ db });
const port = Number(process.env.PORT) || 3001;
httpServer.listen(port, () => {
  console.log(`Tarrot VTT listening on :${port}`);
});
