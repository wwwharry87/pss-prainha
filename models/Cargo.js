// models/Cargo.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Cargo = sequelize.define('Cargo', {
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  nivel: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  requisitos: {
    type: DataTypes.STRING,
  },
  carga_horaria: {
    type: DataTypes.STRING,
  },
  vencimento_basico: {
    type: DataTypes.FLOAT,
  }
}, {
  tableName: 'cargos',
  timestamps: true
});

module.exports = Cargo;
