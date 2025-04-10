// app.js - Versão com ajustes CSP para carregar o DataTables

const express = require("express");
const path = require("path");
const session = require("express-session");
const sequelize = require("./config/database");
const helmet = require("helmet");
require("dotenv").config();

const app = express();

// Configuração do Helmet com CSP personalizado
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://code.jquery.com",
          "https://cdn.jsdelivr.net",
          "https://cdn.datatables.net", // Adicionado para permitir DataTables
          "'unsafe-inline'" // Necessário para scripts inline temporariamente
        ],
        scriptSrcElem: [
          "'self'",
          "https://code.jquery.com",
          "https://cdn.jsdelivr.net",
          "https://cdn.datatables.net", // Adicionado para permitir DataTables
          "'unsafe-inline'"
        ],
        styleSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdn.datatables.net", // Adicionado para permitir CSS do DataTables
          "'unsafe-inline'"
        ],
        styleSrcElem: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdn.datatables.net", // Adicionado para permitir CSS do DataTables
          "'unsafe-inline'"
        ],
        imgSrc: ["'self'", "data:", "https://*"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
        frameSrc: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false // Necessário para iframes de visualização
  })
);

// Configurações do body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configuração de sessão
app.use(
  session({
    secret: process.env.SESSION_SECRET || "sua-chave-secreta-aqui",
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

// Importação dos modelos
const Candidato = require('./models/Candidato');
const Inscricao = require('./models/Inscricao');
const Cargo = require('./models/Cargo');
const CargoRegiao = require('./models/CargoRegiao');
const ValidacaoInscricao = require('./models/ValidacaoInscricao');
const DashboardView = require('./models/DashboardView');

// Definição das associações
Cargo.hasMany(CargoRegiao, { foreignKey: 'cargo_id', as: 'regioes' });
CargoRegiao.belongsTo(Cargo, { foreignKey: 'cargo_id', as: 'cargo' });

Inscricao.belongsTo(Candidato, { foreignKey: 'candidato_id' });
Candidato.hasMany(Inscricao, { foreignKey: 'candidato_id' });

Inscricao.belongsTo(Cargo, { foreignKey: 'cargo_id' });
Cargo.hasMany(Inscricao, { foreignKey: 'cargo_id' });

Inscricao.hasOne(ValidacaoInscricao, { foreignKey: 'inscricao_id' });
ValidacaoInscricao.belongsTo(Inscricao, { foreignKey: 'inscricao_id' });

// Conexão e sincronização com o banco de dados
sequelize
  .authenticate()
  .then(() => {
    console.log("Conectado ao PostgreSQL!");
    const syncOptions = process.env.NODE_ENV === 'development' ? { alter: true } : {};
    return sequelize.sync(syncOptions);
  })
  .then(() => {
    console.log("Modelos sincronizados com sucesso!");
  })
  .catch(err => {
    console.error("Erro na conexão ou sincronização:", err);
    if (err.name === 'SequelizeDatabaseError') {
      console.error("Dica: Verifique se há conflitos com migrações pendentes");
    }
  });

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, "frontend")));

// Rotas da API
const candidatosRouter = require('./routes/candidatos');
const cargosRouter = require('./routes/cargos');
const inscricoesRouter = require('./routes/inscricoes');
const visualizaRouter = require('./routes/visualiza');
const authRouter = require('./routes/auth');
const downloadRouter = require('./routes/download');
const adminRouter = require('./routes/admin');

app.use("/api/candidatos", candidatosRouter);
app.use("/api/cargos", cargosRouter);
app.use("/api/inscricoes", inscricoesRouter);
app.use("/api/visualiza", visualizaRouter);
app.use("/api/auth", authRouter);
app.use('/download', downloadRouter);
app.use("/api/admin", adminRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Rota para o painel admin
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'admin', 'index.html'));
});

// Middleware de erro
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Ocorreu um erro!');
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// Tratamento para encerramento gracioso
process.on('SIGTERM', () => {
  console.log('Recebido SIGTERM. Encerrando servidor...');
  server.close(() => {
    console.log('Servidor encerrado');
    process.exit(0);
  });
});
