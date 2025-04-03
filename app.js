// app.js
const express = require("express");
const path = require("path");
const session = require("express-session");
const sequelize = require("./config/database");
require("dotenv").config();

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "sua-chave-secreta-aqui",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 4 * 60 * 1000 }
}));

// Importa os modelos
const Candidato = require('./models/Candidato');
const Inscricao = require('./models/Inscricao');
const Cargo = require('./models/Cargo');
const CargoRegiao = require('./models/CargoRegiao');

// Definindo as associações entre Cargo e CargoRegiao
Cargo.hasMany(CargoRegiao, { foreignKey: 'cargo_id', as: 'regioes' });
CargoRegiao.belongsTo(Cargo, { foreignKey: 'cargo_id', as: 'cargo' });

sequelize.authenticate()
  .then(() => {
    console.log("Conectado ao PostgreSQL!");
    return sequelize.sync({ alter: true });
  })
  .then(() => console.log("Modelos sincronizados com sucesso!"))
  .catch(err => console.error("Erro na conexão ou sincronização:", err));

// Servir arquivos estáticos do diretório "frontend"
app.use(express.static(path.join(__dirname, "frontend")));

// Monta as rotas de API
const candidatosRouter = require('./routes/candidatos');
const cargosRouter = require('./routes/cargos');
const inscricoesRouter = require('./routes/inscricoes');
const visualizaRouter = require('./routes/visualiza');
const authRouter = require('./routes/auth');
const downloadRouter = require('./routes/download');

app.use("/api/candidatos", candidatosRouter);
app.use("/api/cargos", cargosRouter);
app.use("/api/inscricoes", inscricoesRouter);
app.use("/api/visualiza", visualizaRouter);
app.use("/api/auth", authRouter);
app.use('/download', downloadRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
