# C1 : brainstorm (brouillon de départ)

Ce document est un point de départ écrit en solo. Le vrai C1 se fait à deux équipes : chaque équipe corrige sa section, puis
vous confrontez et listez les désaccords dans `docs/decisions.md`. Rien ici n'est tranché.

## Côté AI : comment on voit l'agent

- **Rôle** : un agent qui prépare les courses d'un villageois à partir d'une phrase (« mes courses de la semaine, 3000 bells, sans lactose »).
- **Boucle** : comprendre la demande, chercher dans le catalogue, recommander (filtrage collaboratif du bootstrap AI, voir `ai/`), vérifier stock, allergènes et budget, proposer un panier, attendre la validation.
- **Outils dont il a besoin** (API) : `search_catalog`, `get_product`, `recommend(user, k)`, `add_to_cart` (proposition seulement), `propose_checkout`.
- **Arrêts et refus** : arrêt si budget dépassé, si plus de N étapes, si produit en rupture sans substitut, ou si la demande est hors sujet. Refus de tout achat sans confirmation et de toute action sur un autre utilisateur.
- **Vérifier un résultat** : allergènes déclarés (`flowshopper_users.csv`) jamais violés, budget respecté, stock suffisant, aucun doublon.
- **Contrainte machine** : modèle local (Ollama ou llama.cpp), donc latence élevée : annoncer chaque étape au fil de l'eau.

## Côté Web : comment on voit le magasin

- **Design et ergonomie** : mobile d'abord, gros boutons (cible 44 px), contraste fort, recherche et catégories toujours visibles, navigation au clavier et lecteur d'écran. Les villageois peuvent être âgés (voir l'image de couverture du sujet).
- **Ce que l'agent peut faire sur le magasin** : remplir le panier, filtrer le catalogue, comparer deux produits. Jamais payer.
- **Voir l'agent travailler** : un fil d'étapes en phrases courtes (« Je cherche du pain sans lactose »), avec un détail dépliable, une région `aria-live` pour les lecteurs d'écran, un bouton Stop toujours visible, et une confirmation explicite avant paiement.

## Points à confronter

1. Niveau de détail du raisonnement affiché (une phrase vs journal complet).
2. Bouton Stop : arrêt immédiat ou à la fin de l'étape en cours.
3. Où vit le panier, et qui est la source de vérité.
4. Latence acceptable avant d'afficher « l'agent réfléchit » et quoi afficher pendant l'attente.
5. Données du villageois transmises à l'agent (allergènes oui ; historique d'achats ?) et conséquences RGPD.

## Croquis

À ajouter par chaque équipe dans `docs/sketches/` (images, photos de papier, Figma, tout format).
