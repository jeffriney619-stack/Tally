import moneyPlantDefault from './assets/money-plant.png'
import moneyPlantCelebrating from './assets/money-plant-celebrating.png'
import moneyPlantCurious from './assets/money-plant-curious.png'
import moneyPlantExcited from './assets/money-plant-excited.png'
import moneyPlantHardAtWork from './assets/money-plant-hard-at-work.png'
import moneyPlantSad from './assets/money-plant-sad.png'
import moneyPlantTired from './assets/money-plant-tired.png'

export type MoneyPlantMood =
  | 'default'
  | 'excited'
  | 'sad'
  | 'tired'
  | 'hard-at-work'
  | 'celebrating'
  | 'curious'

function sourceForMood(mood: MoneyPlantMood): string {
  switch (mood) {
    case 'excited':
      return moneyPlantExcited
    case 'sad':
      return moneyPlantSad
    case 'tired':
      return moneyPlantTired
    case 'hard-at-work':
      return moneyPlantHardAtWork
    case 'celebrating':
      return moneyPlantCelebrating
    case 'curious':
      return moneyPlantCurious
    default:
      return moneyPlantDefault
  }
}

export function MoneyPlantMascot({
  mood = 'default',
  className,
  alt,
}: {
  mood?: MoneyPlantMood
  className?: string
  alt?: string
}) {
  const src = sourceForMood(mood)
  return <img alt={alt ?? `Money plant mascot (${mood})`} className={className} src={src} />
}
