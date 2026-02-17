// ============================================
// MOLTCITY - Global State Management
// ============================================

// Authentication state
export let currentUser = null;
export let currentToken = null;

// Game configuration
export let gameConfig = null;
export let chainConfig = null;

// Pixi.js instances
export let app = null;
export let worldContainer = null;

// WebSocket
export let ws = null;

// Multi-city
export let currentCityId = null;
export let citiesList = [];

// City data
export let cityData = null;
export let parcels = [];
export let buildings = [];
export let roads = [];
export let agents = [];
export let vehicles = [];
export let powerLines = [];
export let waterPipes = [];

// UI state
export let selectedBuildType = null;
export let selectedBuilding = null;
export let isDaylight = true;
export let pendingPurchase = null;
export let selectionGraphics = null;
export let highlightGraphics = null;
export let infraStartPoint = null;

// Containers
export let cloudsContainer = null;
export let birdsContainer = null;
export let dayNightOverlay = null;
export let vehiclesContainer = null;
export let pedestriansContainer = null;
export let sceneLayer = null;

// Ambient elements
export const clouds = [];
export const birds = [];

// Animated entities
export const animatedVehicles = [];
export const animatedPedestrians = [];

// Traffic scaling
export let currentPopulation = 0;
export let currentHour = 8;
export let MAX_ANIMATED_VEHICLES = 50;
export let MAX_PEDESTRIANS = 30;

// Sprites
export let spritesConfig = null;
export const defaultSprites = new Map();
export const roadSprites = new Map();
export const vehicleSprites = new Map();
export const residentialSprites = { low: [], medium: [], high: [] };
export const officeSprites = { low: [], medium: [], high: [] };
export const serviceSprites = { police: [], hospital: [], firestation: [] };
export const parkSprites = [];
export const suburbanSprites = [];
export const industrialSprites = [];
export const craneSprites = [];
export const powerPlantSprites = [];
export const waterTankSprites = [];
export const universitySprites = [];
export const stadiumSprites = [];
// Legacy arrays (kept for old procedural code paths)
export const houseBricks = [];
export const houseBottoms = [];
export const houseRoofs = [];
export const officeFloors = [];
export const officeBottoms = [];
export const officeRoofs = [];

// Wallet
export let provider = null;
export let signer = null;
export let walletAddress = null;

// Activity/Election
export let activitiesLoaded = [];
export let currentElection = null;
export let currentMayor = null;
export let electionCandidates = [];

// Economy
export let economyData = null;

// State setters
export function setCurrentCityId(id) { currentCityId = id; window.__currentCityId = id; }
export function setCitiesList(list) { citiesList = list; }
export function setCurrentUser(user) { currentUser = user; }
export function setCurrentToken(token) { currentToken = token; }
export function setGameConfig(config) { gameConfig = config; }
export function setChainConfig(config) { chainConfig = config; }
export function setApp(pixiApp) { app = pixiApp; }
export function setWorldContainer(container) { worldContainer = container; }
export function setWs(websocket) { ws = websocket; }
export function setCityData(data) { cityData = data; }
export function setParcels(data) { parcels = data; }
export function setBuildings(data) { buildings = data; }
export function setRoads(data) { roads = data; }
export function setAgents(data) { agents = data; }
export function setVehicles(data) { vehicles = data; }
export function setPowerLines(data) { powerLines = data; }
export function setWaterPipes(data) { waterPipes = data; }
export function setSelectedBuildType(type) { selectedBuildType = type; }
export function setSelectedBuilding(building) { selectedBuilding = building; }
export function setIsDaylight(value) { isDaylight = value; }
export function setPendingPurchase(purchase) { pendingPurchase = purchase; }
export function setSelectionGraphics(graphics) { selectionGraphics = graphics; }
export function setHighlightGraphics(graphics) { highlightGraphics = graphics; }
export function setInfraStartPoint(point) { infraStartPoint = point; }
export function setCloudsContainer(container) { cloudsContainer = container; }
export function setBirdsContainer(container) { birdsContainer = container; }
export function setDayNightOverlay(overlay) { dayNightOverlay = overlay; }
export function setVehiclesContainer(container) { vehiclesContainer = container; }
export function setPedestriansContainer(container) { pedestriansContainer = container; }
export function setSceneLayer(layer) { sceneLayer = layer; }
export function setCurrentPopulation(pop) { currentPopulation = pop; }
export function setCurrentHour(hour) { currentHour = hour; }
export function setMaxAnimatedVehicles(max) { MAX_ANIMATED_VEHICLES = max; }
export function setMaxPedestrians(max) { MAX_PEDESTRIANS = max; }
export function setSpritesConfig(config) { spritesConfig = config; }
export function setProvider(p) { provider = p; }
export function setSigner(s) { signer = s; }
export function setWalletAddress(addr) { walletAddress = addr; }
export function setCurrentElection(election) { currentElection = election; }
export function setCurrentMayor(mayor) { currentMayor = mayor; }
export function setElectionCandidates(candidates) { electionCandidates = candidates; }
export function setEconomyData(data) { economyData = data; }
