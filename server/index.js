import { createDb, initSchema } from './db.js';
import { createServer } from './app.js';
import { sweepChatImages } from './images.js';

const db = createDb();
await initSchema(db);
await sweepChatImages(db); // the chat starts empty, so the pictures posted in it before are gone too

const { httpServer } = createServer({ db });
const port = Number(process.env.PORT) || 3001;
httpServer.listen(port, () => {
  console.log(`Tarrot VTT listening on :${port}`);
});
