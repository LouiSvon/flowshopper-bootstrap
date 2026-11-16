# Flowshopper : bootstrap AI et Web

Bootstrap Epitech du projet Flowshopper (épicerie de Tom Nook). Deux volets et un travail commun.

| Volet | Dossier | Contenu |
|---|---|---|
| AI | [`ai/`](ai) | Notebook `flowshopper_recommender.ipynb` : recommandeur par filtrage collaboratif sur MovieLens 100k |
| Web | [`web/`](web) | W1 catalogue + événements, W2 paiement test Stripe confirmé par webhook et temps réel, W3 tests |
| Commun | [`docs/`](docs) | C1 brainstorm, C2 contrat OpenAPI et journal des décisions |
| CI | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | tests unitaires + couverture, e2e téléphone + accessibilité, exécution du notebook |

## AI

```bash
cd ai
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
curl -fsSL -o ml-100k.zip https://files.grouplens.org/datasets/movielens/ml-100k.zip && unzip -q ml-100k.zip -d data
jupyter notebook flowshopper_recommender.ipynb
```

MovieLens n'est pas redistribuable : `ai/data/` est ignoré par git. Le notebook s'exécute de haut en bas (`Restart & Run All`) ;
il contient des `assert` (diagonale de similarité, cosinus à la main contre scikit-learn, aucun film déjà vu recommandé).
Les sections 1 à 6 du sujet y sont traitées, avec les réponses aux questions de réflexion.

## Web

```bash
cd web
npm ci
npm start                 # http://localhost:3000
npm run coverage          # tests unitaires + seuil de couverture
npx playwright install chromium && npm run test:e2e   # e2e sur écran de téléphone + axe-core
```

Le catalogue (`web/data/flowshopper_catalog.csv`, 896 produits) est fourni par le sujet.
`orders.csv` et `users.csv` du sujet ne sont pas dans ce dépôt (volume, données utilisateurs) : ils serviront au projet.

### W2 : paiement test Stripe en direct

Le code est testé sans compte Stripe (signatures générées avec la même bibliothèque, voir `web/test/unit/payments.test.js`).
Pour le tester pour de vrai, il faut un compte Stripe **en mode test** (action à faire par vous : création de compte et clés).

```bash
cp web/.env.example web/.env      # puis remplir les deux clés de TEST
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe   # affiche whsec_... à mettre dans .env
cd web && set -a && source .env && set +a && npm start
```

Ouvrez deux fois la page de commande (`/order.html?id=<order_id>`), payez avec la carte `4242 4242 4242 4242` : les deux pages passent à
« Payment confirmed » sans rechargement. Le serveur refuse toute clé qui ne commence pas par `sk_test_`.

## Ce qui est vérifié, ce qui ne l'est pas

Vérifié automatiquement : notebook exécuté sans erreur ni warning, 17 tests unitaires, 4 tests e2e sur Pixel 5 dont axe-core (WCAG 2.2 AA),
contrat OpenAPI valide.
Non vérifié : paiement Stripe réel de bout en bout, lecteur d'écran (axe ne remplace pas un test humain), CI sur GitHub tant
qu'une PR ne l'a pas exécutée, et le C1 (travail d'équipe).
