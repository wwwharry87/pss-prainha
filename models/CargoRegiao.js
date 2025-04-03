// models/CargoRegiao.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CargoRegiao = sequelize.define('CargoRegiao', {
  cargo_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  zona: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  vagas_imediatas: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  reserva_pcd: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  }
}, {
  tableName: 'cargo_regioes',
  timestamps: true
});

module.exports = CargoRegiao;
