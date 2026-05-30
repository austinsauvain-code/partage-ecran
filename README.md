# Partage d'écran (WebRTC)

Application web pour partager son écran en direct avec une ou plusieurs personnes.
Pas de plugin à installer : tout passe par le navigateur. Le serveur ne sert qu'à
mettre les participants en relation (signalisation) — le flux vidéo va en direct
de pair à pair.

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
2. Entrez un nom de salon (ex : `reunion-mardi`) et cliquez sur « Entrer ».
3. Donnez le même nom de salon (ou le lien copié) à l'autre personne.
4. Une fois les deux dans le salon, cliquez sur « Partager mon écran ».
   L'autre participant voit votre écran instantanément.

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
