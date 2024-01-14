var { sequelize } = require("./dbConnection");
const { DataTypes } = require("sequelize");

Preference = sequelize.define("Preference", {
  userId: {
    type: DataTypes.STRING,
    unique: true,
    primaryKey: true,
  },
  age: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  gender: {
    type: DataTypes.ENUM("Male", "Female"),
    allowNull: true,
  },
  country: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});
exports.Preference = Preference;
