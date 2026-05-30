# Partage d'écran + voix + chat (WebRTC)

Application web pour, dans un même salon : partager son écran, se parler au micro,
et discuter par messages texte. Pas de plugin à installer, tout passe par le
navigateur. Le serveur ne sert qu'à mettre les participants en relation
(signalisation) et à relayer le chat — l'écran et la voix vont en direct de pair
à pair.

## Fonctionnalités
- Partage d'écran (avec le son de l'écran si le navigateur le propose)
- Voix : micro coupé par défaut, bouton pour l'activer/couper
- Chat texte visible par tout le salon
- Plusieurs participants dans un même salon, avec leurs noms

## Limite de la voix (important)
La voix utilise une architecture « maillée » : chaque participant envoie son micro
à tous les autres. C'est fluide jusqu'à ~5-6 personnes. Au-delà, les connexions et
la bande passante montante deviennent lourdes. Pour une voix à 10+ participants, il
faudrait un serveur média (SFU), ce qui sort du cadre de cette app. Le chat texte,
lui, n'a pas cette limite.

## Prérequis
- Node.js 18 ou plus

## Démarrage
```bash
cd screenshare
npm install
npm start
```
Le serveur écoute sur http://localhost:3000

## Utilisation
1. Ouvrez http://localhost:3000 dans votre navigateur.
2. Entrez votre nom et un nom de salon (ex : `reunion-mardi`), cliquez sur « Entrer ».
3. Donnez le même nom de salon (ou le lien copié) aux autres personnes.
4. Dans le salon : « Partager mon écran » pour diffuser, « Activer le micro » pour
   parler, et le panneau de droite pour discuter par messages.

## Tester seul
Ouvrez deux onglets sur le même salon : un onglet partage, l'autre regarde.

## Notes techniques
- `getDisplayMedia` exige un contexte sécurisé : `localhost` fonctionne, mais pour
  un accès distant réel il faut servir l'app en **HTTPS** (le navigateur bloque
  la capture d'écran sinon).
- Les serveurs STUN de Google sont utilisés pour traverser la plupart des réseaux.
  Derrière des NAT/pare-feu stricts (entreprise), il peut être nécessaire d'ajouter
  un serveur **TURN** dans `RTC_CONFIG` (dans `index.html`).
- L'audio de l'onglet/écran est transmis si le navigateur le permet (Chrome/Edge
  proposent « Partager l'audio » lors de la sélection).

## Déploiement distant
Pour un usage hors de votre machine, hébergez le dossier sur un service Node
(Render, Railway, un VPS…) avec HTTPS activé, et partagez l'URL publique.
