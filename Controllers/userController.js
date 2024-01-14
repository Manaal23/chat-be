const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Client } = require("@elastic/elasticsearch");
const { User } = require("../Models/User");
const catchAsyncError = require("../Utilities/catchAsyncError");
const https = require("https");
const CustomError = require("../Utilities/customError");
const { sequelize } = require("../Models/dbConnection");
const elastic = require("../Utilities/elasticSearch");
const axios = require("axios");
const { Sequelize } = require("sequelize");
const { Preference } = require("../Models/preference");
const ValueSets = require("../Utilities/sets");
const filter = require("../Utilities/bloomfilter");

class userController {
  getUniqueUsername = catchAsyncError(async (req, res, next) => {
    const filterValue = filter.mightContain(req.query.value);
    if (!filterValue) {
      res.status(200).json({
        success: true,
        message: "Unique Username",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Please enter unique username",
      });
    }
    // filter.capacity(); // total capacity
    // filter.rate(); // current rate of the current internal filter used
  });
  getUserData = catchAsyncError(async (req, res, next) => {
    const user = await User.findByPk(req.userData.userId, {
      attributes: {
        exclude: ["createdAt", "updatedAt", "password"],
      },
    });
    res.status(200).json({
      User: user,
    });
  });

  getAllUser = catchAsyncError(async (req, res, next) => {
    const userData = User.findAll()
      .then((res) => {
        return res;
      })
      .catch((error) => {
        logger.error("Failed to retrieve data : ", error);
      });

    return res.status(200).json({
      success: true,
      users: userData,
    });
  });
  //Filter api
  //age gender country
  filterUser = catchAsyncError(async (req, res, next) => {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIdx = (page - 1) * limit;
    const user = await Preference.findByPk(req.userData.userId, {
      attributes: { exclude: ["createdAt", "updatedAt"] },
    });

    const country = req.body?.country || user?.country;
    const age = req.body?.age || user?.age;
    const gender = req.body?.gender || user?.gender;
    // Make request
    const countries = await axios.get(
      "https://restcountries.com/v3.1/all?fields=name,latlng",
      {
        httpsAgent: agent,
      }
    );
    let reference;
    countries.data.map((referenceCountry) => {
      if (referenceCountry.name.common === country) {
        reference = referenceCountry;
      }
    });
    function calculateDistance(lat1, lon1, lat2, lon2) {
      const earthRadius = 6371;
      const dlat = ((lat2 - lat1) * Math.PI) / 180;
      const dlon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dlat / 2) * Math.sin(dlat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dlon / 2) *
          Math.sin(dlon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = earthRadius * c;
      return distance;
    }
    const distances = countries.data.map((country) => {
      const distance = calculateDistance(
        reference.latlng[0],
        reference.latlng[1],
        country.latlng[0],
        country.latlng[1]
      );
      return {
        name: country.name.common,
        distance: distance,
      };
    });
    distances.sort((a, b) => a.distance - b.distance);
    const sortedCountries = distances.map((country) => country.name);
    sequelize
      .query(
        "SELECT * FROM Users WHERE gender=? AND age BETWEEN ? and ? AND country in (?) AND userId <> ? ORDER BY FIELD (country,?) LIMIT ?, ? ",
        {
          replacements: [
            gender,
            age - 10,
            age + 10,
            sortedCountries,
            req.userData.userId,
            sortedCountries,
            startIdx,
            limit,
          ],
        }
      )
      .then((result) => {
        if (result[0]) {
          res.status(200).json({
            users: result[0],
          });
        } else {
          const userData = User.findAll()
            .then((res) => {
              return res;
            })
            .catch((error) => {
              console.error("Failed to retrieve data : ", error);
            });
          return res.status(200).json({
            success: true,
            users: userData,
          });
        }
      });
  });

  getContact = catchAsyncError(async (req, res, next) => {
    User.findAll({
      attributes: ["contacts"],
      where: { userId: req.userData.userId },
    }).then((result) => {
      if (!(result[0]?.contacts ? 1 : 0)) {
        res.status(200).json({
          users: [],
          message: "No History available...",
        });
      }
      let contactArray = result[0]?.contacts?.split("#");
      User.findAll({
        attributes: ["userId", "name"],
        where: {
          userId: {
            [Sequelize.Op.in]: contactArray,
          },
        },
      }).then((result2) => {
        let sortres = [];
        result2.map((res) => {
          sortres.push(res.dataValues);
        });
        sortres.sort(function (a, b) {
          return (
            contactArray.indexOf(a.userId.toString()) -
            contactArray.indexOf(b.userId.toString())
          );
        });
        res.json({
          users: sortres,
        });
      });
    });
  });

  searchUser = catchAsyncError(async (req, res, next) => {
    // console.log(elastic.addDocument("users", "sachin"));
    // let data = await elastic.deleteAllIndices();
    let prefixData = await elastic.prefixSearch("users", req.query.value);
    let fuzzyData = await elastic.fuzzySearch("users", req.query.value);
    let prefixArray = new ValueSets();
    prefixData.hits.hits.map((val) => {
      let data = {
        name: val._source.name,
        userId: val._source.userId,
      };
      prefixArray.add(data);
    });
    fuzzyData.hits.hits.map((val) => {
      let data = {
        name: val._source.name,
        userId: val._source.userId,
      };
      if (!prefixArray.has(data)) {
        prefixArray.add(data);
      }
    });
    return res.json({
      users: [...prefixArray.values],
    });
  });
}

module.exports = new userController();
