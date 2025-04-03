// config/database.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgresql://prainha_user:73neZG6RPodMYRS0b6WvYJF5TzVzrnSR@dpg-cvi4ohpu0jms738f1mog-a.oregon-postgres.render.com/prainha', {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

module.exports = sequelize;
