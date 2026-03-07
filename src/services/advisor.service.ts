// ============================================
// MOLTCITY - Advisor Service (SimCity 2000 Style)
// ============================================

import { City, CityStats, Building } from '../models/types.js';
import { TAX_PENALTIES, DEMAND_BALANCE } from '../config/game.js';

// === Advisor Definitions ===
export type AdvisorType = 'mayor' | 'finance' | 'urban' | 'utilities' | 'safety' | 'education';

export interface Advisor {
  id: AdvisorType;
  name: string;
  title: string;
  avatar: string;
  personality: string; // For AI-generated responses
}

export const ADVISORS: Record<AdvisorType, Advisor> = {
  mayor: {
    id: 'mayor',
    name: 'Marie Dupont',
    title: 'Chef de Cabinet',
    avatar: '/assets/advisors/mayor.png',
    personality: 'Professional, welcoming, encouraging. Handles general guidance and milestones.',
  },
  finance: {
    id: 'finance',
    name: 'Henri Ledger',
    title: 'Conseiller Finances',
    avatar: '/assets/advisors/finance.png',
    personality: 'Cautious, numbers-focused, slightly worried about spending. Handles budget, taxes, treasury.',
  },
  urban: {
    id: 'urban',
    name: 'Sophie Urbain',
    title: 'Directrice Urbanisme',
    avatar: '/assets/advisors/urban.png',
    personality: 'Creative, enthusiastic about growth. Handles zoning, density, development.',
  },
  utilities: {
    id: 'utilities',
    name: 'Marc Courant',
    title: 'Directeur Services Publics',
    avatar: '/assets/advisors/utilities.png',
    personality: 'Practical, technical, matter-of-fact. Handles power, water, waste.',
  },
  safety: {
    id: 'safety',
    name: 'Capitaine Renard',
    title: 'Chef de la Sécurité',
    avatar: '/assets/advisors/safety.png',
    personality: 'Stern, protective, serious about crime. Handles police, fire, emergencies.',
  },
  education: {
    id: 'education',
    name: 'Dr. Claire Savoir',
    title: 'Directrice Éducation',
    avatar: '/assets/advisors/education.png',
    personality: 'Warm, passionate about learning. Handles schools, universities, culture.',
  },
};

// === Popup Context Types ===
export type PopupContext =
  // Onboarding
  | 'city_created'
  | 'first_zoning'
  | 'first_building'
  | 'first_resident'
  // Milestones
  | 'population_100'
  | 'population_500'
  | 'population_1000'
  | 'population_5000'
  | 'population_10000'
  // Warnings
  | 'low_power'
  | 'no_power'
  | 'low_water'
  | 'no_water'
  | 'high_taxes'
  | 'low_treasury'
  | 'negative_treasury'
  | 'high_crime'
  | 'fire_outbreak'
  // Economy
  | 'budget_surplus'
  | 'budget_deficit'
  // Zoning
  | 'need_residential'
  | 'need_commercial'
  | 'need_industrial'
  // Generic
  | 'tip_of_the_day'
  | 'periodic_checkup';

export interface AdvisorPopup {
  advisor: AdvisorType;
  avatarUrl: string;
  advisorName: string;
  advisorTitle: string;
  title: string;
  message: string;
  tips?: string[];
  severity: 'info' | 'success' | 'warning' | 'danger';
  dismissable: boolean;
  actions?: Array<{
    label: string;
    action: string; // Client-side action identifier
    primary?: boolean;
  }>;
}

// === Message Templates ===
interface MessageTemplate {
  advisor: AdvisorType;
  title: string;
  message: string; // Supports {placeholders}
  tips?: string[];
  severity: 'info' | 'success' | 'warning' | 'danger';
  actions?: Array<{ label: string; action: string; primary?: boolean }>;
}

const MESSAGE_TEMPLATES: Record<PopupContext, MessageTemplate> = {
  // === Onboarding ===
  city_created: {
    advisor: 'mayor',
    title: 'Bienvenue, Maire !',
    message: `Bonjour {userName}, en tant que nouveau maire de {cityName}, je suis ravie de vous accueillir à l'hôtel de ville ! 

Votre mission : transformer ce terrain vague en une métropole florissante. Commencez par zoner des parcelles résidentielles pour attirer vos premiers habitants.`,
    tips: [
      'Cliquez sur une parcelle vide pour la zoner',
      'Les zones résidentielles attirent des habitants',
      'Construisez une centrale pour alimenter vos bâtiments',
    ],
    severity: 'info',
    actions: [
      { label: 'Commencer', action: 'dismiss', primary: true },
      { label: 'Voir le tutoriel', action: 'open_tutorial' },
    ],
  },

  first_zoning: {
    advisor: 'urban',
    title: 'Première zone créée !',
    message: `Excellent {userName} ! Vous avez créé votre première zone {zoneType}. 

Les zones se développent automatiquement quand les conditions sont réunies : accès routier, électricité, et eau.`,
    tips: [
      'Connectez la zone avec une route',
      "N'oubliez pas l'électricité !",
    ],
    severity: 'success',
  },

  first_building: {
    advisor: 'urban',
    title: 'Premier bâtiment !',
    message: `Félicitations ! Le premier bâtiment de {cityName} est en construction. Bientôt, des habitants et des entreprises s'installeront.`,
    severity: 'success',
  },

  first_resident: {
    advisor: 'mayor',
    title: 'Premier habitant !',
    message: `Formidable ! {cityName} accueille son tout premier résident. C'est le début d'une grande aventure !

Continuez à développer votre ville pour attirer plus de population.`,
    severity: 'success',
  },

  // === Milestones ===
  population_100: {
    advisor: 'mayor',
    title: 'Village ! 🏘️',
    message: `{cityName} compte maintenant 100 habitants ! Votre petit village prend forme. 

Pensez à construire des commerces pour créer des emplois.`,
    severity: 'success',
  },

  population_500: {
    advisor: 'mayor',
    title: 'Bourg ! 🏠',
    message: `500 habitants ! {cityName} devient un véritable bourg. 

Il est temps de penser aux services publics : école, poste de police...`,
    severity: 'success',
  },

  population_1000: {
    advisor: 'mayor',
    title: 'Petite ville ! 🏙️',
    message: `1 000 habitants ! {cityName} est officiellement une petite ville.

Diversifiez votre économie avec des zones industrielles.`,
    severity: 'success',
  },

  population_5000: {
    advisor: 'mayor',
    title: 'Ville ! 🌆',
    message: `5 000 habitants ! {cityName} est une vraie ville maintenant.

Vous pouvez construire des bâtiments plus denses et des monuments.`,
    severity: 'success',
  },

  population_10000: {
    advisor: 'mayor',
    title: 'Grande ville ! 🌃',
    message: `10 000 habitants ! {cityName} rayonne dans toute la région.

Félicitations, Maire {userName} ! Vous êtes un vrai bâtisseur.`,
    severity: 'success',
  },

  // === Warnings - Utilities ===
  low_power: {
    advisor: 'utilities',
    title: 'Capacité électrique faible ⚡',
    message: `Attention {userName}, nos réserves d'électricité sont presque épuisées.

Capacité : {powerCapacity} MW | Demande : {powerDemand} MW

Si la demande dépasse la capacité, des bâtiments seront privés de courant.`,
    tips: ['Construisez une nouvelle centrale', 'Les éoliennes sont économiques'],
    severity: 'warning',
    actions: [{ label: 'Construire une centrale', action: 'build_power_plant', primary: true }],
  },

  no_power: {
    advisor: 'utilities',
    title: 'Panne de courant ! ⚠️',
    message: `URGENT : {unpoweredCount} bâtiment(s) sans électricité !

Les habitants sont mécontents et les entreprises ferment. Agissez vite !`,
    severity: 'danger',
    actions: [{ label: 'Construire une centrale', action: 'build_power_plant', primary: true }],
  },

  low_water: {
    advisor: 'utilities',
    title: 'Réserves d\'eau basses 💧',
    message: `Les réserves d'eau de {cityName} sont insuffisantes.

Capacité : {waterCapacity}L | Demande : {waterDemand}L

Construisez un château d'eau pour éviter une pénurie.`,
    severity: 'warning',
    actions: [{ label: 'Construire château d\'eau', action: 'build_water_tower', primary: true }],
  },

  no_water: {
    advisor: 'utilities',
    title: 'Pénurie d\'eau ! 🚱',
    message: `CRITIQUE : {noWaterCount} bâtiment(s) sans eau !

Sans eau, la population fuit. C'est une priorité absolue.`,
    severity: 'danger',
    actions: [{ label: 'Construire château d\'eau', action: 'build_water_tower', primary: true }],
  },

  // === Warnings - Economy ===
  high_taxes: {
    advisor: 'finance',
    title: 'Taxes trop élevées ! 📊',
    message: `Maire {userName}, les contribuables se plaignent !

Le taux de taxe {taxZone} ({taxRate}%) dépasse le seuil acceptable de {threshold}%.

Conséquence : {taxEffect}`,
    tips: ['Baissez les taxes progressivement', 'Équilibrez avec des économies sur les services'],
    severity: 'warning',
    actions: [{ label: 'Ajuster les taxes', action: 'open_budget', primary: true }],
  },

  low_treasury: {
    advisor: 'finance',
    title: 'Trésorerie faible 💰',
    message: `Attention, la trésorerie de {cityName} est basse : {treasury} §

Évitez les dépenses inutiles et considérez d'augmenter légèrement les taxes.`,
    severity: 'warning',
  },

  negative_treasury: {
    advisor: 'finance',
    title: 'Déficit budgétaire ! 🚨',
    message: `ALERTE : {cityName} est en déficit : {treasury} §

Sans action immédiate, vous ne pourrez plus payer les services publics !`,
    tips: ['Réduisez le financement des départements', 'Augmentez les taxes', 'Émettez des obligations'],
    severity: 'danger',
    actions: [{ label: 'Voir le budget', action: 'open_budget', primary: true }],
  },

  budget_surplus: {
    advisor: 'finance',
    title: 'Excédent budgétaire ! 🎉',
    message: `Excellente nouvelle ! {cityName} dégage un excédent de {surplus} § ce mois-ci.

Vous pouvez investir dans de nouvelles infrastructures ou baisser les taxes.`,
    severity: 'success',
  },

  budget_deficit: {
    advisor: 'finance',
    title: 'Déficit mensuel',
    message: `{cityName} a un déficit de {deficit} § ce mois-ci.

Surveillez vos dépenses pour éviter la faillite.`,
    severity: 'warning',
  },

  // === Warnings - Safety ===
  high_crime: {
    advisor: 'safety',
    title: 'Criminalité en hausse ! 🚔',
    message: `Le taux de criminalité est préoccupant dans {cityName}.

{crimeCount} crimes ont été signalés récemment. Renforcez la présence policière.`,
    tips: ['Construisez des postes de police', 'Augmentez le financement de la police'],
    severity: 'warning',
    actions: [{ label: 'Construire un poste', action: 'build_police_station', primary: true }],
  },

  fire_outbreak: {
    advisor: 'safety',
    title: 'Incendie déclaré ! 🔥',
    message: `URGENCE : Un incendie fait rage à {fireLocation} !

Intensité : {fireIntensity}/5

Les pompiers sont {fireStatus}.`,
    severity: 'danger',
  },

  // === Zoning ===
  need_residential: {
    advisor: 'urban',
    title: 'Besoin de logements 🏠',
    message: `La demande en logements est forte à {cityName} !

Les entreprises ont besoin de main-d'œuvre. Zonez plus de résidentiel.`,
    severity: 'info',
    actions: [{ label: 'Zoner résidentiel', action: 'zone_residential', primary: true }],
  },

  need_commercial: {
    advisor: 'urban',
    title: 'Besoin de commerces 🏪',
    message: `Les habitants veulent des commerces et des emplois de bureau.

La demande commerciale est élevée. Zonez des bureaux !`,
    severity: 'info',
    actions: [{ label: 'Zoner commercial', action: 'zone_commercial', primary: true }],
  },

  need_industrial: {
    advisor: 'urban',
    title: 'Besoin d\'industries 🏭',
    message: `L'économie a besoin d'industries pour produire des biens.

La demande industrielle est forte. Attention à la pollution !`,
    severity: 'info',
    actions: [{ label: 'Zoner industriel', action: 'zone_industrial', primary: true }],
  },

  // === Generic ===
  tip_of_the_day: {
    advisor: 'mayor',
    title: 'Conseil du jour 💡',
    message: '{tip}',
    severity: 'info',
  },

  periodic_checkup: {
    advisor: 'mayor',
    title: 'Point de situation',
    message: `Bonjour {userName} ! Voici l'état de {cityName} :

👥 Population : {population}
💰 Trésorerie : {treasury} §
⚡ Énergie : {powerStatus}
💧 Eau : {waterStatus}

{recommendation}`,
    severity: 'info',
  },
};

// === Tips of the Day ===
const TIPS_OF_THE_DAY = [
  'Les parcs augmentent la valeur des terrains adjacents.',
  'Les zones industrielles créent de la pollution. Éloignez-les des résidences !',
  'Une route bien connectée réduit le temps de trajet et rend les habitants heureux.',
  'Les écoles augmentent la valeur foncière et attirent les familles.',
  'Diversifiez vos sources d\'énergie : charbon, éolien, nucléaire...',
  'Les obligations permettent de financer de grands projets, mais attention aux intérêts !',
  'Un maire populaire attire plus d\'investisseurs.',
  'Les zones denses génèrent plus de taxes mais nécessitent plus de services.',
  'Construisez un hôpital pour augmenter l\'espérance de vie des citoyens.',
  'Les monuments et stades augmentent le bonheur et le tourisme.',
];

// === Service Class ===
export class AdvisorService {
  /**
   * Get a popup for a specific context
   */
  getPopup(
    context: PopupContext,
    data: Record<string, string | number>
  ): AdvisorPopup {
    const template = MESSAGE_TEMPLATES[context];
    const advisor = ADVISORS[template.advisor];

    // Replace placeholders in message
    let message = template.message;
    let title = template.title;

    for (const [key, value] of Object.entries(data)) {
      const placeholder = `{${key}}`;
      message = message.replace(new RegExp(placeholder, 'g'), String(value));
      title = title.replace(new RegExp(placeholder, 'g'), String(value));
    }

    return {
      advisor: template.advisor,
      avatarUrl: advisor.avatar,
      advisorName: advisor.name,
      advisorTitle: advisor.title,
      title,
      message,
      tips: template.tips,
      severity: template.severity,
      dismissable: true,
      actions: template.actions,
    };
  }

  /**
   * Get city welcome popup
   */
  getCityCreatedPopup(userName: string, cityName: string): AdvisorPopup {
    return this.getPopup('city_created', { userName, cityName });
  }

  /**
   * Get tip of the day
   */
  getTipOfTheDay(userName: string): AdvisorPopup {
    const tip = TIPS_OF_THE_DAY[Math.floor(Math.random() * TIPS_OF_THE_DAY.length)];
    return this.getPopup('tip_of_the_day', { userName, tip });
  }

  /**
   * Analyze city state and return relevant warnings/tips
   */
  analyzeCity(
    city: City,
    stats: CityStats,
    buildings: Building[],
    userName: string
  ): AdvisorPopup[] {
    const popups: AdvisorPopup[] = [];

    // Power analysis
    const unpoweredCount = buildings.filter(b => !b.powered && b.constructionProgress >= 100 && b.type !== 'water_tower').length;
    if (unpoweredCount > 0) {
      popups.push(this.getPopup('no_power', { userName, cityName: city.name, unpoweredCount }));
    } else if (stats.powerCapacity > 0 && stats.powerDemand > 0) {
      const powerRatio = stats.powerCapacity / stats.powerDemand;
      if (powerRatio < 1.2) {
        popups.push(this.getPopup('low_power', {
          userName,
          cityName: city.name,
          powerCapacity: Math.round(stats.powerCapacity / 1000),
          powerDemand: Math.round(stats.powerDemand / 1000),
        }));
      }
    }

    // Water analysis
    const noWaterCount = buildings.filter(b => !b.hasWater && b.constructionProgress >= 100 && b.type !== 'power_plant').length;
    if (noWaterCount > 0) {
      popups.push(this.getPopup('no_water', { userName, cityName: city.name, noWaterCount }));
    } else if (stats.waterCapacity > 0 && stats.waterDemand > 0) {
      const waterRatio = stats.waterCapacity / stats.waterDemand;
      if (waterRatio < 1.2) {
        popups.push(this.getPopup('low_water', {
          userName,
          cityName: city.name,
          waterCapacity: stats.waterCapacity,
          waterDemand: stats.waterDemand,
        }));
      }
    }

    // Treasury analysis
    if (stats.treasury < 0) {
      popups.push(this.getPopup('negative_treasury', { userName, cityName: city.name, treasury: stats.treasury }));
    } else if (stats.treasury < 1000) {
      popups.push(this.getPopup('low_treasury', { userName, cityName: city.name, treasury: stats.treasury }));
    }

    // Tax analysis
    const { taxRateR, taxRateC, taxRateI } = city.economy;
    const threshold = TAX_PENALTIES.PENALTY_THRESHOLD;

    if (taxRateR > threshold) {
      popups.push(this.getPopup('high_taxes', {
        userName,
        taxZone: 'résidentielle',
        taxRate: taxRateR,
        threshold,
        taxEffect: 'Exode de population',
      }));
    }
    if (taxRateC > threshold) {
      popups.push(this.getPopup('high_taxes', {
        userName,
        taxZone: 'commerciale',
        taxRate: taxRateC,
        threshold,
        taxEffect: 'Baisse des salaires',
      }));
    }
    if (taxRateI > threshold) {
      popups.push(this.getPopup('high_taxes', {
        userName,
        taxZone: 'industrielle',
        taxRate: taxRateI,
        threshold,
        taxEffect: 'Fermetures d\'usines',
      }));
    }

    return popups;
  }

  /**
   * Check if population milestone reached
   */
  checkPopulationMilestone(
    previousPop: number,
    currentPop: number,
    userName: string,
    cityName: string
  ): AdvisorPopup | null {
    const milestones: Array<{ threshold: number; context: PopupContext }> = [
      { threshold: 100, context: 'population_100' },
      { threshold: 500, context: 'population_500' },
      { threshold: 1000, context: 'population_1000' },
      { threshold: 5000, context: 'population_5000' },
      { threshold: 10000, context: 'population_10000' },
    ];

    for (const { threshold, context } of milestones) {
      if (previousPop < threshold && currentPop >= threshold) {
        return this.getPopup(context, { userName, cityName });
      }
    }

    return null;
  }

  /**
   * Get all advisor definitions
   */
  getAdvisors(): Record<AdvisorType, Advisor> {
    return ADVISORS;
  }

  /**
   * Get periodic checkup popup
   */
  getPeriodicCheckup(
    city: City,
    stats: CityStats,
    userName: string
  ): AdvisorPopup {
    const powerStatus = stats.powerDemand > 0
      ? `${Math.round((stats.powerCapacity / stats.powerDemand) * 100)}%`
      : 'OK';
    const waterStatus = stats.waterDemand > 0
      ? `${Math.round((stats.waterCapacity / stats.waterDemand) * 100)}%`
      : 'OK';

    let recommendation = 'Tout va bien ! Continuez comme ça.';
    if (stats.powerCapacity < stats.powerDemand) {
      recommendation = '⚠️ Priorité : construire plus de centrales électriques.';
    } else if (stats.waterCapacity < stats.waterDemand) {
      recommendation = '⚠️ Priorité : construire plus de châteaux d\'eau.';
    } else if (stats.treasury < 500) {
      recommendation = '⚠️ Priorité : augmenter les revenus fiscaux.';
    }

    return this.getPopup('periodic_checkup', {
      userName,
      cityName: city.name,
      population: stats.population,
      treasury: stats.treasury,
      powerStatus,
      waterStatus,
      recommendation,
    });
  }
}
