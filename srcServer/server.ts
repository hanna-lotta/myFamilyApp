import 'dotenv/config';
import express from 'express'
import type { Express, Request, RequestHandler, Response } from 'express';
import cors from 'cors';
import loginRouter from './routes/login.js';
import registerRouter from './routes/register.js';
import chatRouter from './routes/chat.js';
import familyRouter from './routes/family.js';

const port: number = Number(process.env.PORT) || 1338
const app: Express = express()

const logger: RequestHandler = (req: Request, _res: Response, next) => {
  console.log(`Request received: ${req.method} ${req.url}`);  //lägg till body vid post/put
  next();
};
app.use('/', logger);
app.use(express.json());
app.use(cors());
app.use(express.static('./dist/'))

// API Routes
app.use('/api/login', loginRouter);
app.use('/api/register', registerRouter);
app.use('/api/family', familyRouter);
app.use('/api/chat', chatRouter);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})