import type { Card, Zone, Player, GameConfig, ZoneVisibility } from '@playing-cards/shared'

function makeZone(
  id: string,
  name: string,
  visibility: ZoneVisibility,
  ownerId: string | null,
  capacity: number | null,
  isBluffPile = false,
  gridPosition: { row: number; col: number } | null = null,
): Zone {
  return { id, name, visibility, ownerId, cards: [], capacity, gridPosition, claimLabel: null, isBluffPile }
}

export function buildZones(config: GameConfig, players: Player[]): Zone[] {
  const zones: Zone[] = []

  for (const template of config.zoneTemplates) {
    if (template.perPlayer) {
      for (const player of players) {
        if (config.gameType === 'cambio') {
          // 4 individual positional zones per player in a 2x2 grid
          const positions = [
            { row: 0, col: 0 }, { row: 0, col: 1 },
            { row: 1, col: 0 }, { row: 1, col: 1 },
          ]
          for (const pos of positions) {
            zones.push(makeZone(
              `${template.id}-${player.id}-${pos.row}-${pos.col}`,
              template.name,
              template.visibility,
              player.id,
              1,
              false,
              pos,
            ))
          }
        } else {
          zones.push(makeZone(
            `${template.id}-${player.id}`,
            template.name,
            template.visibility,
            player.id,
            template.capacity,
            template.isBluffPile ?? false,
          ))
        }
      }
    } else {
      zones.push(makeZone(
        template.id,
        template.name,
        template.visibility,
        null,
        template.capacity,
        template.isBluffPile ?? false,
      ))
    }
  }

  return zones
}

export function dealCards(
  deck: Card[],
  zones: Zone[],
  config: GameConfig,
  players: Player[],
): { zones: Zone[]; remaining: Card[] } {
  const updatedZones = zones.map(z => ({ ...z, cards: [...z.cards] }))
  let pile = [...deck]

  if (config.gameType === 'cambio') {
    // Deal 1 card to each of the 4 positional zones per player
    for (const player of players) {
      const positions = [
        { row: 0, col: 0 }, { row: 0, col: 1 },
        { row: 1, col: 0 }, { row: 1, col: 1 },
      ]
      for (const pos of positions) {
        const zoneId = `pos-${player.id}-${pos.row}-${pos.col}`
        const zone = updatedZones.find(z => z.id === zoneId)
        if (zone && pile.length > 0) {
          zone.cards.push(pile.shift()!)
        }
      }
    }
    return { zones: updatedZones, remaining: pile }
  }

  if (config.gameType === 'euchre') {
    // Deal 5 to each player hand, 4 to kitty
    for (const player of players) {
      const handZone = updatedZones.find(z => z.id === `hand-${player.id}`)
      if (handZone) {
        for (let i = 0; i < 5 && pile.length > 0; i++) {
          handZone.cards.push(pile.shift()!)
        }
      }
    }
    const kitty = updatedZones.find(z => z.id === 'kitty')
    if (kitty) {
      for (let i = 0; i < 4 && pile.length > 0; i++) {
        kitty.cards.push(pile.shift()!)
      }
    }
    return { zones: updatedZones, remaining: pile }
  }

  if (config.gameType === 'blackjack') {
    // Deal 2 to each player hand, 1 face-down + 1 face-up to dealer
    for (const player of players) {
      const handZone = updatedZones.find(z => z.id === `hand-${player.id}`)
      if (handZone) {
        for (let i = 0; i < 2 && pile.length > 0; i++) {
          handZone.cards.push(pile.shift()!)
        }
      }
    }
    // Dealer: first card face-down (stored as face-down zone), second face-up
    // We mark the first dealer card with a special id prefix handled by client
    const dealerZone = updatedZones.find(z => z.id === 'dealer-hand')
    if (dealerZone && pile.length >= 2) {
      const faceDown = pile.shift()!
      const faceUp = pile.shift()!
      // Tag first card as face-down via id suffix
      dealerZone.cards.push({ ...faceDown, id: `${faceDown.id}__facedown` })
      dealerZone.cards.push(faceUp)
    }
    return { zones: updatedZones, remaining: pile }
  }

  if (config.gameType === 'poker') {
    // Deal 2 hole cards per player
    for (const player of players) {
      const holeZone = updatedZones.find(z => z.id === `hole-cards-${player.id}`)
      if (holeZone) {
        for (let i = 0; i < 2 && pile.length > 0; i++) {
          holeZone.cards.push(pile.shift()!)
        }
      }
    }
    return { zones: updatedZones, remaining: pile }
  }

  // president / bluff — deal all cards as evenly as possible
  const handZones = updatedZones.filter(z => z.ownerId !== null && z.id.startsWith('hand-'))
  let i = 0
  while (pile.length > 0) {
    const zone = handZones[i % handZones.length]
    zone.cards.push(pile.shift()!)
    i++
  }
  return { zones: updatedZones, remaining: [] }
}
