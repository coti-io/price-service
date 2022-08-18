import { Column, Entity, EntityManager } from 'typeorm';
import { BaseEntity } from '.';
import { TableNames } from '../enums';
import { exec } from '../utils';

@Entity(TableNames.APP_STATES)
export class AppStateEntity extends BaseEntity {
  @Column()
  name: string;

  @Column()
  value: string;
}

export const getAppStateByName = async (defaultManager: EntityManager, name: string, lock: boolean): Promise<AppStateEntity> => {
  const query = defaultManager.getRepository<AppStateEntity>(TableNames.APP_STATES).createQueryBuilder().where({ name });
  if (lock) {
    query.setLock('pessimistic_write');
  }
  const [err, appState] = await exec(query.getOne());
  if (err) throw err;
  return appState;
};
