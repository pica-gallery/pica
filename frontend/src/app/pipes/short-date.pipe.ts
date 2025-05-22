import {Pipe, type PipeTransform} from '@angular/core';

const FORMAT = new Intl.DateTimeFormat(navigator.language, {
  year: '2-digit',
  day: 'numeric',
  month: 'numeric',
})

@Pipe({
  name: 'shortDate'
})
export class ShortDatePipe implements PipeTransform {
  transform(value: unknown, ...args: unknown[]): unknown {
    if (value instanceof Date || typeof value === 'number') {
      return FORMAT.format(value)
    }

    // not a date
    return null
  }
}
