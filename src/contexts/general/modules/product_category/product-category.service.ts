import { Inject, Injectable } from '@nestjs/common';
// import { ProductCategory } from './interface/product_category.interface';
import { DATABASE } from '@/contexts/general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import { generalQueries } from '@general/general.queries';

const { productCategory } = generalQueries;

@Injectable()
export class ProductCategoryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getAllCategories() {
    const categories = await this.db.query(productCategory.all);
    return categories.rows;
  }

  async getAllCategoriesPaginated(
    search: string | null,
    limit: number,
    offset: number,
  ) {
    const categories = await this.db.query(productCategory.allPaginated, [
      search || null,
      limit,
      offset,
    ]);
    return categories.rows;
  }

  async getCategoryById(id: string) {
    const category = await this.db.query(productCategory.byId, [id]);
    return category.rows[0];
  }

  async createCategory(name: string) {
    const cat = await this.db.query(productCategory.create, [name]);
    return { message: 'Category created successfully', cat: cat.rows[0] };
  }

  async updateCategory(id: string, newName: string) {
    await this.db.query(productCategory.update, [newName, id]);
    return { message: 'Category updated successfully' };
  }

  async deleteCategory(id: string) {
    await this.db.query(productCategory.delete, [id]);
    return { message: 'Category deleted successfully' };
  }
}
