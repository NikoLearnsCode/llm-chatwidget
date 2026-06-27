import {Icon} from './Icon';
import type {IconProps} from './types';

export function Square(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x='6' y='6' width='12' height='12' rx='2' fill='currentColor' />
    </Icon>
  );
}
