/** UUID généré sur l'appareil : permet de créer des données hors ligne sans conflit à la synchronisation. */
export const nouvelId = (): string => crypto.randomUUID()
