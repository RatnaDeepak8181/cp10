const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();
app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error:${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
        SELECT
            *
        FROM
            user
        WHERE
            username = '${username}';`;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordCorrect = await bcrypt.compare(password, dbUser.password);
    if (isPasswordCorrect === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authentication = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  if (!authHeader) {
    response.status(401);
    response.send("Missing Authorization header");
    return;
  }
  const jwtToken = authHeader.split(" ")[1];
  if (!jwtToken) {
    response.status(401);
    response.send("Missing JWT token");
    return;
  }
  jwt.verify(jwtToken, "SECRET_TOKEN", (error, decoded) => {
    if (error) {
      console.log(`JWT verification error: ${error.message}`);
      response.status(401);
      response.send("Invalid JWT token");
      return;
    }
    // If the token is valid, call the next middleware function in the chain
    next();
  });
};

module.exports = authentication;

const convertDbObjectToResponsiveObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

app.get("/states/", authentication, async (request, response) => {
  const getStatesQuery = `
        SELECT
            *
        FROM
            state
        ORDER BY 
            state_id;`;
  const statesArray = await database.all(getStatesQuery);
  response.send(
    statesArray.map((eachState) => convertDbObjectToResponsiveObject(eachState))
  );
});

app.get("/states/:stateId/", authentication, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
        SELECT
            *
        FROM
            state
        WHERE
            state_id = ${stateId};`;
  const stateObj = await database.get(getStateQuery);
  response.send(convertDbObjectToResponsiveObject(stateObj));
});

app.post("/districts/", authentication, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const postDistrictDetailsQuery = `
        INSERT INTO district
            VALUES(
                '${districtName}',
                '${stateId}',
                '${cases}',
                '${cured}',
                '${active}',
                '${deaths}'
            );`;
  await database.run(postDistrictDetailsQuery);
  response.send("District Successfully Added");
});

const convertDBObjectToResponsiveObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

app.get(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
        SELECT
            district_id AS  districtId,
            district_name AS districtName,
            stateId,
            cases,
            cured,
            active,
            deaths
        FROM
            district
        WHERE
            district_id = ${districtId};`;
    const districtObj = await database.get(getDistrictQuery);
    response.send(districtObj);
  }
);

app.delete(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrict = `
        DELETE FROM district
            WHERE
                district_id = ${districtId};`;
    await database, run(deleteDistrict);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrict = `
        UPDATE district
            SET
            district_name = '${districtName}',
            state_id = ${stateId},
            cases = ${cases},
            cured = ${cured},
            active = ${active},
            deaths = ${deaths};`;
    await database.run(updateDistrict);
    response.send("District Details Updated");
  }
);
app.get("states/:stateId/stats/", authentication, async (request, response) => {
  const { stateId } = request.params;
  const getStats = `
        SELECT
            SUM(cases) AS totalCases,
            SUM(cured) As totalCures,
            SUM(active) AS totalActive,
            SUM(Deaths) AS totalDeaths
        FROM
            district
        WHERE
            state_id = ${stateId};`;
  const stats = await database.get(getStats);
  response.send(stats);
});

module.exports = app;
