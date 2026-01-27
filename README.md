# 🖨️ Klipper Overlay for OBS

Serveur local Node.js pour afficher les informations d'une imprimante 3D Klipper en overlay dans OBS Studio.

![Klipper](https://img.shields.io/badge/Klipper-Compatible-green)
![Node.js](https://img.shields.io/badge/Node.js-20+-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)

## 📋 Fonctionnalités

- ✅ **Overlay temps réel** pour OBS avec fond transparent
- ✅ **Thumbnail du print** en cours (prévisualisation du modèle)
- ✅ **Affichage des températures** (buse, plateau)
- ✅ **État de l'impression** (impression, pause, inactif)
- ✅ **Progression en pourcentage** avec barre visuelle
- ✅ **Nom du fichier** en cours d'impression
- ✅ **Temps écoulé et restant** estimé (basé sur les métadonnées du sliceur)
- ✅ **API REST** pour interrogation JSON
- ✅ **Auto-reconnexion** si Moonraker déconnecté
- ✅ **WebSocket** pour updates temps réel
- ✅ **Paramètres d'affichage** via URL (scale, position, compact)
- ✅ **Complètement en français** 🇫🇷
- ✅ **Systemd service** inclus pour auto-démarrage
- ✅ **Docker support** avec docker-compose

## 🚀 Installation

### Prérequis

- **Node.js 20+** installé
- **Serveur Klipper/Moonraker** accessible sur le réseau

### 1. Cloner ou télécharger le projet

```bash
cd /chemin/vers/klipper-overlay
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer l'environnement

Copier le fichier `.env.example` vers `.env` :

```bash
cp .env.example .env
```

Éditer le fichier `.env` :

```env
MOONRAKER_URL=http://192.168.1.155:7125
PORT=8080
CORS_ENABLED=true
REFRESH_INTERVAL=1000
```

### 4. Lancer le serveur

**Mode développement** (avec hot-reload) :
```bash
npm run dev
```

**Mode production** :
```bash
npm run build
npm start
```

Le serveur démarre sur `http://localhost:8080`

## 🎥 Configuration dans OBS Studio

### 1. Ajouter une source Navigateur

1. Dans OBS, cliquer sur **➕** dans "Sources"
2. Sélectionner **"Navigateur"**
3. Configurer comme suit :

| Paramètre | Valeur |
|-----------|--------|
| **URL** | `http://localhost:8080/overlay` |
| **Largeur** | `400` (ajustable) |
| **Hauteur** | `300` (ajustable) |
| **Contrôler l'audio via OBS** | ✅ Coché |
| **Actualiser le cache** | ❌ Décoché |

4. ✅ **Cocher "Arrière-plan transparent"** (important !)
5. Cliquer sur OK

### 2. Personnalisation via paramètres URL

Vous pouvez personnaliser l'affichage en ajoutant des paramètres à l'URL :

```
http://localhost:8080/overlay?scale=1.2&pos=top-right&compact=1
```

| Paramètre | Valeurs | Description |
|-----------|---------|-------------|
| `scale` | `0.5` à `2.0` | Échelle de l'overlay (défaut: 1.0) |
| `compact` | `1` | Mode compact (moins d'espacement) |
| `pos` | `top-left`, `top-right`, `bottom-left`, `bottom-right` | Position fixe |

**Exemples :**

- Overlay agrandi : `?scale=1.5`
- Coin haut-droit : `?pos=top-right`
- Compact et petit : `?scale=0.8&compact=1`

## 📡 API REST

### GET `/api/status`

Retourne le status actuel de l'imprimante.

**Réponse (200 OK) :**

```json
{
  "success": true,
  "data": {
    "state": "printing",
    "progress": 45,
    "filename": "benchy.gcode",
    "extruderTemp": 215,
    "extruderTarget": 220,
    "bedTemp": 58,
    "bedTarget": 60,
    "timeRemaining": 3600,
    "printDuration": 2400,
    "thumbnail": "http://192.168.1.155:7125/server/files/gcodes/.thumbs/benchy-300x300.png",
    "timestamp": 1706345678901
  }
}
```

**États possibles :** `impression`, `pause`, `inactif`, `erreur`, `déconnecté`

### GET `/api/health`

Health check du serveur.

**Réponse (200 OK) :**

```json
{
  "status": "ok",
  "moonraker": "connected",
  "timestamp": 1706345678901
}
```

### GET `/api/config`

Retourne la configuration de l'overlay.

**Réponse (200 OK) :**

```json
{
  "success": true,
  "data": {
    "showThumbnail": true,
    "showFilename": true,
    "showProgress": true,
    "showTemperatures": true,
    "showTimes": true,
    "showStatus": true
  }
}
```

### POST `/api/config`

Met à jour la configuration de l'overlay. Permet de masquer/afficher des blocs dynamiquement.

**Corps de la requête :**

```json
{
  "showThumbnail": false,
  "showTemperatures": false
}
```

**Réponse (200 OK) :**

```json
{
  "success": true,
  "data": {
    "showThumbnail": false,
    "showFilename": true,
    "showProgress": true,
    "showTemperatures": false,
    "showTimes": true,
    "showStatus": true
  },
  "message": "Configuration mise à jour"
}
```

**Paramètres disponibles :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `showThumbnail` | booléen | Afficher/masquer la preview de l'impression |
| `showFilename` | booléen | Afficher/masquer le nom du fichier |
| `showProgress` | booléen | Afficher/masquer la progression (% + barre) |
| `showTemperatures` | booléen | Afficher/masquer les températures (buse/plateau) |
| `showTimes` | booléen | Afficher/masquer les temps (durée + restant) |
| `showStatus` | booléen | Afficher/masquer l'état (impression/pause/inactif) |

### POST `/api/config/reset`

Réinitialise la configuration par défaut (tous les blocs affichés).

**Réponse (200 OK) :**

```json
{
  "success": true,
  "data": {
    "showThumbnail": true,
    "showFilename": true,
    "showProgress": true,
    "showTemperatures": true,
    "showTimes": true,
    "showStatus": true
  },
  "message": "Configuration réinitialisée"
}
```

**Exemples pratiques :**

Masquer la thumbnail :
```bash
curl -X POST http://localhost:8080/api/config \
  -H "Content-Type: application/json" \
  -d '{"showThumbnail": false}'
```

Mode minimal (que l'état et la progression) :
```bash
curl -X POST http://localhost:8080/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "showThumbnail": false,
    "showFilename": false,
    "showTemperatures": false,
    "showTimes": false
  }'
```

## 🐳 Docker (optionnel)

### Build de l'image

```bash
docker build -t klipper-overlay .
```

### Run du container

```bash
docker run -d \
  --name klipper-overlay \
  -p 8080:8080 \
  -e MOONRAKER_URL=http://192.168.1.155:7125 \
  klipper-overlay
```

### Avec docker-compose (recommandé)

Le projet inclut un fichier `docker-compose.yml` pré-configuré :

```bash
docker-compose up -d
```

Arrêter :
```bash
docker-compose down
```

## 🔧 Service Systemd (auto-démarrage)

Le projet inclut un service systemd pour lancer l'overlay automatiquement au démarrage.

### Installation du service

```bash
sudo cp /root/KlipperOverlay/KlipperOverlay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable KlipperOverlay.service
sudo systemctl start KlipperOverlay.service
```

### Gérer le service

```bash
# Vérifier le statut
sudo systemctl status KlipperOverlay.service

# Voir les logs en temps réel
sudo journalctl -u KlipperOverlay.service -f

# Redémarrer
sudo systemctl restart KlipperOverlay.service

# Arrêter
sudo systemctl stop KlipperOverlay.service
```

## 🛠️ Scripts npm disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Lance le serveur en mode développement (hot-reload) |
| `npm run build` | Compile le TypeScript vers JavaScript |
| `npm start` | Lance le serveur en mode production |
| `npm run clean` | Supprime le dossier `dist/` |

## 📂 Structure du projet

```
klipper-overlay/
├── src/
│   ├── index.ts                    # Serveur Express principal
│   ├── config.ts                   # Configuration (.env)
│   ├── services/
│   │   └── moonraker.service.ts    # Service API Moonraker (avec cache thumbnail)
│   ├── routes/
│   │   └── api.routes.ts           # Routes API REST
│   └── types/
│       └── index.ts                # Types TypeScript
├── public/
│   ├── overlay.html                # Page overlay OBS (avec thumbnail)
│   ├── overlay.css                 # Styles (responsive, animations)
│   └── overlay.js                  # Script client (polling 1x/sec)
├── package.json
├── tsconfig.json
├── .env.example
├── Dockerfile                      # Build multi-stage optimisé
├── docker-compose.yml              # Orchestration Docker
├── KlipperOverlay.service          # Service systemd
└── README.md
```

## 🔧 Dépannage

### L'overlay affiche "Déconnecté"

1. Vérifier que Moonraker est accessible :
   ```bash
   curl http://192.168.1.155:7125/printer/info
   ```

2. Vérifier le fichier `.env` (bonne URL)

3. Regarder les logs du serveur :
   ```bash
   npm run dev
   ```

### Pas de fond transparent dans OBS

- ✅ Vérifier que "Arrière-plan transparent" est coché dans les propriétés de la source Navigateur
- Redémarrer OBS si besoin

### Le serveur ne démarre pas

- Vérifier que le port 8080 n'est pas déjà utilisé :
  ```bash
  lsof -i :8080
  ```
- Changer le port dans `.env` si besoin

## 🌐 Accès depuis le réseau local

Pour accéder à l'overlay depuis un autre appareil :

1. Trouver l'IP locale de votre machine :
   ```bash
   # Linux/macOS
   ip addr show
   # ou
   ifconfig
   ```

2. Utiliser l'URL : `http://VOTRE_IP:8080/overlay`

3. Activer CORS dans `.env` si nécessaire :
   ```env
   CORS_ENABLED=true
   ```

## 📝 Notes techniques

- 🔄 Le serveur interroge Moonraker **toutes les secondes** pour les updates
- 🖼️ Les thumbnails sont **cachés 30 secondes** pour éviter les requêtes répétées
- ⏱️ Le **temps restant** est calculé à partir de l'estimation du sliceur (métadonnées gcode)
- 🔌 Les connexions WebSocket se **reconnectent automatiquement** en cas d'échec
- 💾 L'overlay continue de **fonctionner hors-ligne** (affiche "Déconnecté")
- 🌐 **CORS** activé par défaut pour accès depuis le réseau
- 📱 **Responsive** : fonctionne sur mobile/tablette/bureau

## 🎯 Cas d'usage

- 📹 **Streaming OBS** : affiche l'état de l'impression en direct
- 🖥️ **Dashboard local** : page de statut accessible depuis n'importe quel navigateur
- 📊 **API tiers** : intégration avec Home Assistant, Node-RED, etc.
- 🔔 **Webhooks** : extensible pour notifications

## 📄 Licence

MIT

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

## 🔗 Ressources

- [Documentation Moonraker API](https://moonraker.readthedocs.io/en/latest/web_api/)
- [OBS Studio](https://obsproject.com/)
- [Klipper](https://www.klipper3d.org/)

---

**Fait avec ❤️ pour la communauté Klipper** 🖨️

