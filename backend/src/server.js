import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth.js';
import leadsRouter from './routes/leads.js';
import documentsRouter from './routes/documents.js';
import bulkUploadRouter from './routes/bulkUpload.js';
import checklistStatusRouter from './routes/checklistStatus.js';
import loanTypesRouter from './routes/loanTypes.js';
import auditLogsRouter from './routes/auditLogs.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Security: helmet adds critical security headers
app.use(helmet());

// Compression: gzip responses
app.use(compression());

// Request logging
app.use(morgan('dev'));

// CORS configuration for production
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/bulk', bulkUploadRouter);
app.use('/api/checklist-status', checklistStatusRouter);
app.use('/api/loan-types', loanTypesRouter);
app.use('/api/audit-logs', auditLogsRouter);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Instafin API is running' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});