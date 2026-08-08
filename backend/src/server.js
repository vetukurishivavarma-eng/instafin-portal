import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import leadsRouter from './routes/leads.js';
import documentsRouter from './routes/documents.js';
import bulkUploadRouter from './routes/bulkUpload.js';
import checklistStatusRouter from './routes/checklistStatus.js';
import loanTypesRouter from './routes/loanTypes.js';
import auditLogsRouter from './routes/auditLogs.js';
import formsRouter from './routes/forms.js';
import creditQueriesRouter from './routes/creditQueries.js';
import statusHistoryRouter from './routes/statusHistory.js';
import deleteRequestsRouter from './routes/deleteRequests.js';
import followUpsRouter from './routes/followUps.js';
import archivesRouter from './routes/archives.js';
import cibilRouter from './routes/cibil.js';
import hurdlesRouter from './routes/hurdles.js';
import { hurdleGuard } from './middleware/hurdleGuard.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration for production
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Daily Hurdle access guard — blocks executives with unresolved overdue tasks
// from every screen except the auth + hurdles endpoints. Must run before routers.
app.use(hurdleGuard);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/bulk', bulkUploadRouter);
app.use('/api/checklist-status', checklistStatusRouter);
app.use('/api/loan-types', loanTypesRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/forms', formsRouter);
app.use('/api/credit-queries', creditQueriesRouter);
app.use('/api/status-history', statusHistoryRouter);
app.use('/api/delete-requests', deleteRequestsRouter);
app.use('/api/leads', deleteRequestsRouter);
app.use('/api/follow-ups', followUpsRouter);
app.use('/api/archives', archivesRouter);
app.use('/api/cibil', cibilRouter);
app.use('/api/hurdles', hurdlesRouter);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Instafin API is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});