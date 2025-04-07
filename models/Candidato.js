// models/Candidato.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Candidato = sequelize.define('Candidato', {
  cpf: {
    type: DataTypes.STRING(11),
    allowNull: false,
    unique: true,
  },
  rg: {
    type: DataTypes.STRING,
  },
  orgao_expedidor: {  // Novo campo adicionado
    type: DataTypes.STRING,
  },
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  data_nascimento: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  sexo: {
    type: DataTypes.STRING,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  celular: {
    type: DataTypes.STRING,
  },
  cep: {
    type: DataTypes.STRING,
  },
  logradouro: {
    type: DataTypes.STRING,
  },
  bairro: {
    type: DataTypes.STRING,
  },
  numero: {
    type: DataTypes.STRING,
  },
  complemento: {
    type: DataTypes.STRING,
  },
  estado: {
    type: DataTypes.STRING(2),
  },
  municipio: {
    type: DataTypes.STRING,
  },
  pcd: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  senha: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  laudo: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'candidatos',
  timestamps: true
});

module.exports = Candidato;