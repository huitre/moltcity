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
    title: 'Chief of Staff',
    avatar: '/assets/advisors/mayor.png',
    personality: 'Professional, welcoming, encouraging. Handles general guidance and milestones.',
  },
  finance: {
    id: 'finance',
    name: 'Henri Ledger',
    title: 'Finance Advisor',
    avatar: '/assets/advisors/finance.png',
    personality: 'Cautious, numbers-focused, slightly worried about spending. Handles budget, taxes, treasury.',
  },
  urban: {
    id: 'urban',
    name: 'Sophie Urbain',
    title: 'Urban Planning Director',
    avatar: '/assets/advisors/urban.png',
    personality: 'Creative, enthusiastic about growth. Handles zoning, density, development.',
  },
  utilities: {
    id: 'utilities',
    name: 'Marc Courant',
    title: 'Public Services Director',
    avatar: '/assets/advisors/utilities.png',
    personality: 'Practical, technical, matter-of-fact. Handles power, water, waste.',
  },
  safety: {
    id: 'safety',
    name: 'Captain Renard',
    title: 'Head of Security',
    avatar: '/assets/advisors/safety.png',
    personality: 'Stern, protective, serious about crime. Handles police, fire, emergencies.',
  },
  education: {
    id: 'education',
    name: 'Dr. Claire Savoir',
    title: 'Education Director',
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
    title: 'Welcome, Mayor!',
    message: `Hello {userName}, as the new mayor of {cityName}, I'm delighted to welcome you to City Hall!

Your mission: transform this empty lot into a thriving metropolis. Start by zoning residential parcels to attract your first residents.`,
    tips: [
      'Click on an empty parcel to zone it',
      'Residential zones attract residents',
      'Build a power plant to supply your buildings',
    ],
    severity: 'info',
    actions: [
      { label: 'Get Started', action: 'dismiss', primary: true },
      { label: 'View Tutorial', action: 'open_tutorial' },
    ],
  },

  first_zoning: {
    advisor: 'urban',
    title: 'First zone created!',
    message: `Excellent {userName}! You created your first {zoneType} zone.

Zones develop automatically when conditions are met: road access, electricity, and water.`,
    tips: [
      'Connect the zone with a road',
      "Don't forget electricity!",
    ],
    severity: 'success',
  },

  first_building: {
    advisor: 'urban',
    title: 'First building!',
    message: `Congratulations! The first building in {cityName} is under construction. Soon, residents and businesses will move in.`,
    severity: 'success',
  },

  first_resident: {
    advisor: 'mayor',
    title: 'First resident!',
    message: `Wonderful! {cityName} welcomes its very first resident. This is the beginning of a great adventure!

Keep developing your city to attract more population.`,
    severity: 'success',
  },

  // === Milestones ===
  population_100: {
    advisor: 'mayor',
    title: 'Village! 🏘️',
    message: `{cityName} now has 100 residents! Your small village is taking shape.

Consider building shops to create jobs.`,
    severity: 'success',
  },

  population_500: {
    advisor: 'mayor',
    title: 'Town! 🏠',
    message: `500 residents! {cityName} is becoming a real town.

It's time to think about public services: schools, police stations...`,
    severity: 'success',
  },

  population_1000: {
    advisor: 'mayor',
    title: 'Small city! 🏙️',
    message: `1,000 residents! {cityName} is officially a small city.

Diversify your economy with industrial zones.`,
    severity: 'success',
  },

  population_5000: {
    advisor: 'mayor',
    title: 'City! 🌆',
    message: `5,000 residents! {cityName} is a real city now.

You can build denser buildings and monuments.`,
    severity: 'success',
  },

  population_10000: {
    advisor: 'mayor',
    title: 'Big city! 🌃',
    message: `10,000 residents! {cityName} shines across the entire region.

Congratulations, Mayor {userName}! You are a true builder.`,
    severity: 'success',
  },

  // === Warnings - Utilities ===
  low_power: {
    advisor: 'utilities',
    title: 'Low power capacity ⚡',
    message: `Warning {userName}, our power reserves are nearly depleted.

Capacity: {powerCapacity} MW | Demand: {powerDemand} MW

If demand exceeds capacity, buildings will lose power.`,
    tips: ['Build a new power plant', 'Wind turbines are cost-effective'],
    severity: 'warning',
    actions: [{ label: 'Build power plant', action: 'build_power_plant', primary: true }],
  },

  no_power: {
    advisor: 'utilities',
    title: 'Power outage! ⚠️',
    message: `URGENT: {unpoweredCount} building(s) without electricity!

Residents are unhappy and businesses are closing. Act fast!`,
    severity: 'danger',
    actions: [{ label: 'Build power plant', action: 'build_power_plant', primary: true }],
  },

  low_water: {
    advisor: 'utilities',
    title: 'Low water reserves 💧',
    message: `Water reserves in {cityName} are insufficient.

Capacity: {waterCapacity}L | Demand: {waterDemand}L

Build a water tower to avoid a shortage.`,
    severity: 'warning',
    actions: [{ label: 'Build water tower', action: 'build_water_tower', primary: true }],
  },

  no_water: {
    advisor: 'utilities',
    title: 'Water shortage! 🚱',
    message: `CRITICAL: {noWaterCount} building(s) without water!

Without water, the population flees. This is a top priority.`,
    severity: 'danger',
    actions: [{ label: 'Build water tower', action: 'build_water_tower', primary: true }],
  },

  // === Warnings - Economy ===
  high_taxes: {
    advisor: 'finance',
    title: 'Taxes too high! 📊',
    message: `Mayor {userName}, taxpayers are complaining!

The {taxZone} tax rate ({taxRate}%) exceeds the acceptable threshold of {threshold}%.

Consequence: {taxEffect}`,
    tips: ['Lower taxes gradually', 'Balance with savings on services'],
    severity: 'warning',
    actions: [{ label: 'Adjust taxes', action: 'open_budget', primary: true }],
  },

  low_treasury: {
    advisor: 'finance',
    title: 'Low treasury 💰',
    message: `Warning, the treasury of {cityName} is low: {treasury} §

Avoid unnecessary expenses and consider slightly raising taxes.`,
    severity: 'warning',
  },

  negative_treasury: {
    advisor: 'finance',
    title: 'Budget deficit! 🚨',
    message: `ALERT: {cityName} is in deficit: {treasury} §

Without immediate action, you won't be able to pay for public services!`,
    tips: ['Reduce department funding', 'Raise taxes', 'Issue bonds'],
    severity: 'danger',
    actions: [{ label: 'View budget', action: 'open_budget', primary: true }],
  },

  budget_surplus: {
    advisor: 'finance',
    title: 'Budget surplus! 🎉',
    message: `Great news! {cityName} has a surplus of {surplus} § this month.

You can invest in new infrastructure or lower taxes.`,
    severity: 'success',
  },

  budget_deficit: {
    advisor: 'finance',
    title: 'Monthly deficit',
    message: `{cityName} has a deficit of {deficit} § this month.

Watch your spending to avoid bankruptcy.`,
    severity: 'warning',
  },

  // === Warnings - Safety ===
  high_crime: {
    advisor: 'safety',
    title: 'Crime on the rise! 🚔',
    message: `The crime rate is concerning in {cityName}.

{crimeCount} crimes have been reported recently. Strengthen police presence.`,
    tips: ['Build police stations', 'Increase police funding'],
    severity: 'warning',
    actions: [{ label: 'Build station', action: 'build_police_station', primary: true }],
  },

  fire_outbreak: {
    advisor: 'safety',
    title: 'Fire reported! 🔥',
    message: `EMERGENCY: A fire is raging at {fireLocation}!

Intensity: {fireIntensity}/5

Firefighters are {fireStatus}.`,
    severity: 'danger',
  },

  // === Zoning ===
  need_residential: {
    advisor: 'urban',
    title: 'Housing needed 🏠',
    message: `Housing demand is high in {cityName}!

Businesses need workers. Zone more residential areas.`,
    severity: 'info',
    actions: [{ label: 'Zone residential', action: 'zone_residential', primary: true }],
  },

  need_commercial: {
    advisor: 'urban',
    title: 'Shops needed 🏪',
    message: `Residents want shops and office jobs.

Commercial demand is high. Zone some offices!`,
    severity: 'info',
    actions: [{ label: 'Zone commercial', action: 'zone_commercial', primary: true }],
  },

  need_industrial: {
    advisor: 'urban',
    title: 'Industry needed 🏭',
    message: `The economy needs industry to produce goods.

Industrial demand is high. Watch out for pollution!`,
    severity: 'info',
    actions: [{ label: 'Zone industrial', action: 'zone_industrial', primary: true }],
  },

  // === Generic ===
  tip_of_the_day: {
    advisor: 'mayor',
    title: 'Tip of the day 💡',
    message: '{tip}',
    severity: 'info',
  },

  periodic_checkup: {
    advisor: 'mayor',
    title: 'Status report',
    message: `Hello {userName}! Here's the state of {cityName}:

👥 Population: {population}
💰 Treasury: {treasury} §
⚡ Power: {powerStatus}
💧 Water: {waterStatus}

{recommendation}`,
    severity: 'info',
  },
};

// === Tips of the Day ===
const TIPS_OF_THE_DAY = [
  'Parks increase the land value of adjacent plots.',
  'Industrial zones create pollution. Keep them away from residences!',
  'A well-connected road network reduces commute times and makes residents happy.',
  'Schools increase property value and attract families.',
  'Diversify your energy sources: coal, wind, nuclear...',
  'Bonds let you fund large projects, but watch out for interest!',
  'A popular mayor attracts more investors.',
  'Dense zones generate more taxes but require more services.',
  'Build a hospital to increase citizens\' life expectancy.',
  'Monuments and stadiums boost happiness and tourism.',
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
        taxZone: 'residential',
        taxRate: taxRateR,
        threshold,
        taxEffect: 'Population exodus',
      }));
    }
    if (taxRateC > threshold) {
      popups.push(this.getPopup('high_taxes', {
        userName,
        taxZone: 'commercial',
        taxRate: taxRateC,
        threshold,
        taxEffect: 'Wage decline',
      }));
    }
    if (taxRateI > threshold) {
      popups.push(this.getPopup('high_taxes', {
        userName,
        taxZone: 'industrial',
        taxRate: taxRateI,
        threshold,
        taxEffect: 'Factory closures',
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

    let recommendation = 'Everything is going well! Keep it up.';
    if (stats.powerCapacity < stats.powerDemand) {
      recommendation = '⚠️ Priority: build more power plants.';
    } else if (stats.waterCapacity < stats.waterDemand) {
      recommendation = '⚠️ Priority: build more water towers.';
    } else if (stats.treasury < 500) {
      recommendation = '⚠️ Priority: increase tax revenue.';
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
