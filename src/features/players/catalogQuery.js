/**
 * WHERE/ORDER BY construction for the players_catalog browse endpoint.
 *
 * Every value reaches MySQL as a bound parameter. The only interpolated SQL is
 * drawn from the fixed maps in this file, never from request input.
 */

const POS_GROUPS = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB"],
  MID: ["CMF", "DMF", "AMF", "LMF", "RMF"],
  FWD: ["RWF", "LWF", "CF", "SS"],
};

/** Match client POSITION_LINE_ORDER: CF…GK forward, reverse for DESC. */
const POSITION_ORDER_FIELD =
  "FIELD(UPPER(TRIM(IFNULL(position,''))), 'CF','SS','RWF','LWF','AMF','RMF','LMF','CMF','DMF','RB','LB','CB','GK')";

/** Unmatched positions sort last rather than first (FIELD returns 0 for no match). */
const POSITION_ORDER_ASC =
  `CASE WHEN ${POSITION_ORDER_FIELD} = 0 THEN 999 ELSE ${POSITION_ORDER_FIELD} END ASC`;

const SORT_MAP = {
  overall_max_desc: `ISNULL(overall_max), overall_max DESC, overall DESC, ${POSITION_ORDER_ASC}, name ASC`,
  overall_max_asc:  `ISNULL(overall_max), overall_max ASC, overall ASC, ${POSITION_ORDER_ASC}, name ASC`,
  overall_desc:     `overall DESC, ${POSITION_ORDER_ASC}, name ASC`,
  overall_asc:      `overall ASC, ${POSITION_ORDER_ASC}, name ASC`,
  name_asc:         "name DESC, overall DESC",
  name_desc:        "name ASC, overall DESC",
  position_asc:     `${POSITION_ORDER_ASC}, overall DESC, name ASC`,
  position_desc:    `${POSITION_ORDER_FIELD} DESC, overall DESC, name ASC`,
  height_desc:      "height DESC, overall DESC, name ASC",
  height_asc:       "ISNULL(height), height ASC, overall DESC, name ASC",
  weight_desc:      "weight DESC, overall DESC, name ASC",
  weight_asc:       "ISNULL(weight), weight ASC, overall DESC, name ASC",
  age_asc:          "ISNULL(age), age ASC, overall DESC, name ASC",
  age_desc:         "age DESC, overall DESC, name ASC",
  club_asc:         "ISNULL(club), club ASC, overall DESC, name ASC",
  club_desc:        "ISNULL(club), club DESC, overall DESC, name ASC",
  nationality_asc:  "ISNULL(nationality), nationality ASC, overall DESC, name ASC",
  nationality_desc: "ISNULL(nationality), nationality DESC, overall DESC, name ASC",
};

export const DEFAULT_SORT = "overall_max_desc";

/** Columns exposed to the client for a catalog row. */
export const CATALOG_COLUMNS = `pesdb_id AS id, name, position,
        overall, overall_max,
        club, league, nationality, height, weight, age,
        card_type, region, foot, playing_style`;

/** Columns offered by /api/players/filter-options and the distinct-value endpoint. */
export const FILTER_OPTION_COLUMNS = ["foot", "playing_style", "card_type", "league", "region"];
export const DISTINCT_FIELDS = ["club", "nationality", "league"];

const splitCsv = (raw) =>
  String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Resolves the position filter from the three mutually-exclusive query forms. */
function resolvePositions({ positions, posGroup, position }) {
  if (positions) return splitCsv(positions).map((p) => p.toUpperCase());
  if (posGroup && POS_GROUPS[posGroup]) return POS_GROUPS[posGroup];
  return position ? [position.toUpperCase()] : [];
}

class QueryBuilder {
  constructor() {
    this.conditions = [];
    this.params = [];
  }

  /** `col LIKE %value%` */
  like(column, value) {
    if (!value) return;
    this.conditions.push(`${column} LIKE ?`);
    this.params.push(`%${value}%`);
  }

  /** `col >= ?` / `col <= ?` */
  compare(column, operator, value) {
    if (!value) return;
    this.conditions.push(`${column} ${operator} ?`);
    this.params.push(Number(value));
  }

  /** `(col = ? OR col = ?)` from a comma-separated value list. */
  anyOf(column, csv) {
    const values = splitCsv(csv);
    if (!values.length) return;
    this.conditions.push(`(${values.map(() => `${column} = ?`).join(" OR ")})`);
    this.params.push(...values);
  }

  in(column, values) {
    if (!values.length) return;
    this.conditions.push(`${column} IN (${values.map(() => "?").join(",")})`);
    this.params.push(...values);
  }

  raw(condition, ...params) {
    this.conditions.push(condition);
    this.params.push(...params);
  }

  get where() {
    return this.conditions.length ? `WHERE ${this.conditions.join(" AND ")}` : "";
  }
}

/** Builds the WHERE clause and bound parameters for a catalog search. */
export function buildCatalogFilter(query) {
  const {
    q, position, positions, posGroup,
    club, nationality,
    foot, playingStyle, cardType, league,
    overallMin, overallMax, maxOverallMin, maxOverallMax,
    heightMin, heightMax,
    weightMin, weightMax,
    ageMin, ageMax,
  } = query;

  const qb = new QueryBuilder();

  qb.like("name", q);
  qb.in("position", resolvePositions({ positions, posGroup, position }));
  qb.like("club", club);
  qb.like("nationality", nationality);

  qb.anyOf("foot", foot);
  qb.anyOf("playing_style", playingStyle);
  qb.anyOf("card_type", cardType);
  qb.anyOf("league", league);

  qb.compare("overall", ">=", overallMin);
  qb.compare("overall", "<=", overallMax);
  if (maxOverallMin) qb.raw("(overall_max IS NOT NULL AND overall_max >= ?)", Number(maxOverallMin));
  if (maxOverallMax) qb.raw("(overall_max IS NOT NULL AND overall_max <= ?)", Number(maxOverallMax));

  qb.compare("height", ">=", heightMin);
  qb.compare("height", "<=", heightMax);
  qb.compare("weight", ">=", weightMin);
  qb.compare("weight", "<=", weightMax);
  qb.compare("age", ">=", ageMin);
  qb.compare("age", "<=", ageMax);

  return { where: qb.where, params: qb.params };
}

export function resolveSortOrder(sortBy) {
  return SORT_MAP[sortBy] ?? SORT_MAP[DEFAULT_SORT];
}
