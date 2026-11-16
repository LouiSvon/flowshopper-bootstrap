# Journal des décisions et désaccords

Format : une entrée par décision, la plus récente en bas. Statut : `décidé`, `à valider` ou `désaccord ouvert`.
Une décision qui change le contrat (`docs/openapi.yaml`) est faite dans le même commit.

## Organisation (C2)

| Sujet | Décision | Statut |
|---|---|---|
| Format du contrat | OpenAPI 3.1 dans `docs/openapi.yaml`, validé par `openapi-spec-validator` | décidé |
| Partage des versions | Un seul dépôt, une branche `feature/*` par sujet, PR relue par l'autre équipe avant fusion | à valider |
| Faire tourner le travail de l'autre | `web/` : `npm ci && npm start` ; `ai/` : `pip install -r requirements.txt` puis le notebook ; le contrat sert de maquette (mock) tant que l'autre partie n'existe pas | à valider |
| Qui fait quoi | Web : `web/`, parties `web` du contrat. AI : `ai/`, parties `agent` du contrat. Partagé : contrat, journal | à valider (noms à remplir) |

## Décisions techniques

| # | Décision | Raison | Statut |
|---|---|---|---|
| D1 | Événements anonymes : `session_id` aléatoire par onglet, jamais d'identité, ni e-mail, ni nom | RGPD : minimiser dès la collecte (voir guide CNIL du développeur) | décidé |
| D2 | Événements envoyés par lots via `sendBeacon`, déduplication par `event_id` côté serveur | Un lot peut être renvoyé sans doublon ; la fermeture d'onglet ne perd rien | décidé |
| D3 | Stockage des événements en JSON Lines (`web/data/events.jsonl`) | Suffisant pour le bootstrap ; à remplacer par une base quand le volume le demande | décidé, provisoire |
| D4 | Le prix est lu côté serveur depuis le catalogue, jamais envoyé par le client | Sinon un client peut payer 1 bell un produit à 500 | décidé |
| D5 | 1 bell = 1 centime d'euro dans Stripe (mode test uniquement) | Les bells ne sont pas une devise Stripe ; seul le test est visé | décidé |
| D6 | Une commande n'est `paid` que sur webhook Stripe signé, traité de façon idempotente (`event.id`) | La page peut mentir ou être fermée ; Stripe peut livrer deux fois | décidé |
| D7 | Temps réel par WebSocket `/ws?order=<id>`, un canal par commande | Évite de diffuser les commandes des autres ; l'identifiant aléatoire sert de capacité | décidé |
| D8 | L'agent n'achète jamais seul : tout achat passe par `needs_confirmation` | Action irréversible et visible : le villageois valide | à valider (AI) |
| D9 | Flux de l'agent en Server-Sent Events, un `AgentEvent` court par étape (`summary` ≤ 200 car., `detail` dépliable) | Lecture « d'un coup d'oeil » sans noyer l'écran ; SSE suffit, le flux est à sens unique | à valider (Web + AI) |
| D10 | Données MovieLens et `orders.csv` hors dépôt | Licence MovieLens (pas de redistribution) et taille ; voir README | décidé |

## Désaccords ouverts

À remplir pendant le C1 par les deux équipes. Exemples à trancher :

1. L'agent doit-il être arrêtable à tout moment (bouton Stop) même pendant un appel d'outil ? (Web : oui, AI : à chiffrer)
2. Combien de détail montrer du raisonnement ? (Web : une phrase + dépliable ; AI : le journal complet est utile au debug)
3. Le panier est-il côté Web ou côté agent ? (aujourd'hui : côté Web, l'agent ne fait que le proposer)
