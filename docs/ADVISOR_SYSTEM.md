# MoltCity Advisor System 📋

Système de conseillers inspiré de SimCity 2000 pour guider les joueurs.

## Overview

Le système d'advisors fournit des popups contextuels avec des personnages qui guident le joueur :
- Messages de bienvenue à la création de ville
- Alertes sur les problèmes (électricité, eau, budget)
- Célébrations des milestones (population)
- Conseils du jour

## Les Conseillers

| ID | Nom | Titre | Domaine |
|---|---|---|---|
| `mayor` | Marie Dupont | Chef de Cabinet | Accueil, milestones, guidance générale |
| `finance` | Henri Ledger | Conseiller Finances | Budget, taxes, trésorerie |
| `urban` | Sophie Urbain | Directrice Urbanisme | Zonage, densité, développement |
| `utilities` | Marc Courant | Directeur Services Publics | Électricité, eau, déchets |
| `safety` | Capitaine Renard | Chef de la Sécurité | Police, pompiers, urgences |
| `education` | Dr. Claire Savoir | Directrice Éducation | Écoles, universités, culture |

## API Endpoints

### GET /api/advisor/popup
Popup contextuel basé sur un trigger.

**Query params:**
- `context` (required): Type de popup (`city_created`, `low_power`, etc.)
- `cityId` (optional): ID de la ville

**Contexts disponibles:**
- Onboarding: `city_created`, `first_zoning`, `first_building`, `first_resident`
- Milestones: `population_100`, `population_500`, `population_1000`, `population_5000`, `population_10000`
- Warnings: `low_power`, `no_power`, `low_water`, `no_water`, `high_taxes`, `low_treasury`, `negative_treasury`, `high_crime`, `fire_outbreak`
- Economy: `budget_surplus`, `budget_deficit`
- Zoning: `need_residential`, `need_commercial`, `need_industrial`
- Generic: `tip_of_the_day`, `periodic_checkup`

**Response:**
```json
{
  "advisor": "mayor",
  "avatarUrl": "/assets/advisors/mayor.png",
  "advisorName": "Marie Dupont",
  "advisorTitle": "Chef de Cabinet",
  "title": "Bienvenue, Maire !",
  "message": "Bonjour {userName}, en tant que nouveau maire de {cityName}...",
  "tips": ["Conseil 1", "Conseil 2"],
  "severity": "info|success|warning|danger",
  "dismissable": true,
  "actions": [
    { "label": "Commencer", "action": "dismiss", "primary": true },
    { "label": "Tutoriel", "action": "open_tutorial" }
  ]
}
```

### GET /api/advisor/popup/welcome
Popup de bienvenue à la création de ville.

### GET /api/advisor/popup/checkup
Rapport périodique sur l'état de la ville.

### GET /api/advisor/popup/warnings
Liste tous les avertissements actuels pour une ville.

### GET /api/advisor/popup/tip
Conseil du jour aléatoire.

### GET /api/advisor/list
Liste tous les conseillers disponibles.

## Intégration Frontend

### Trigger au bon moment

```typescript
// À la création de ville
async function onCityCreated(cityId: string) {
  const res = await fetch(`/api/advisor/popup/welcome?cityId=${cityId}`);
  const popup = await res.json();
  showAdvisorPopup(popup);
}

// Vérification périodique des warnings
async function checkWarnings(cityId: string) {
  const res = await fetch(`/api/advisor/popup/warnings?cityId=${cityId}`);
  const { warnings } = await res.json();
  if (warnings.length > 0) {
    showAdvisorPopup(warnings[0]); // Affiche le plus urgent
  }
}
```

### Composant Popup React (exemple)

```tsx
function AdvisorPopup({ popup, onDismiss, onAction }) {
  return (
    <div className={`advisor-popup severity-${popup.severity}`}>
      <div className="advisor-header">
        <img src={popup.avatarUrl} alt={popup.advisorName} />
        <div>
          <strong>{popup.advisorName}</strong>
          <span>{popup.advisorTitle}</span>
        </div>
      </div>
      
      <h3>{popup.title}</h3>
      <p>{popup.message}</p>
      
      {popup.tips && (
        <ul className="tips">
          {popup.tips.map((tip, i) => <li key={i}>{tip}</li>)}
        </ul>
      )}
      
      <div className="actions">
        {popup.actions?.map((action, i) => (
          <button 
            key={i}
            className={action.primary ? 'primary' : 'secondary'}
            onClick={() => onAction(action.action)}
          >
            {action.label}
          </button>
        ))}
        {popup.dismissable && (
          <button onClick={onDismiss}>Fermer</button>
        )}
      </div>
    </div>
  );
}
```

## Assets Requis

Placez les avatars des conseillers dans `/client/assets/advisors/`:
- `mayor.png` - Marie Dupont
- `finance.png` - Henri Ledger
- `urban.png` - Sophie Urbain
- `utilities.png` - Marc Courant
- `safety.png` - Capitaine Renard
- `education.png` - Dr. Claire Savoir

**Recommandations:**
- Taille: 128x128 ou 256x256 pixels
- Style: Pixel art ou cartoon pour matcher l'esthétique SimCity
- Format: PNG avec transparence

## Évolutions futures

- [ ] Génération de messages via LLM pour plus de variété
- [ ] Personnalité des conseillers (optimiste vs pessimiste)
- [ ] Historique des popups vus par le joueur
- [ ] Système de "meeting" avec plusieurs conseillers
- [ ] Voix synthétique (TTS) pour les messages importants
