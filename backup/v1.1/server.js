import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import leadsRouter from './routes/leads.js';
import documentsRouter from './routes/documents.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/documents', documentsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});