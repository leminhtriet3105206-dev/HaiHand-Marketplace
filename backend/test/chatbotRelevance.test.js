const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

describe('chatbotRelevance', () => {
  test('chatbot extracts search keywords and returns matching products', async () => {
    const book = {
      _id: 'book',
      title: 'Sách thiếu nhi',
      price: 50000,
      category: 'Sách & Văn phòng phẩm',
      location: 'TP.HCM',
      description: 'Sách truyện thiếu nhi cũ',
      images: ['book.jpg'],
      status: 'active'
    };

    let call = 0;
    class OpenAI {
      constructor() {
        this.chat = {
          completions: {
            create: async () => {
              const content = [
                '{"mainIntent":"search_product","keywords":["sách"],"maxPrice":null,"minPrice":null,"location":null}',
                'Mình đã tìm thấy sách phù hợp.'
              ][call++];
              return { choices: [{ message: { content } }] };
            }
          }
        };
      }
    }

    const mockPostModel = {
      find: () => ({
        select: () => ({
          limit: () => ({
            lean: async () => [book]
          })
        })
      })
    };

    const dependencies = {
      openai: { OpenAI },
      mongoose: {
        models: { Post: mockPostModel },
        model: () => mockPostModel,
        Schema: function Schema() {}
      },
      '../models/Product': { Post: mockPostModel }
    };

    const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
    const mod = { exports: {} };
    const load = vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`);
    load((name) => dependencies[name], mod, { env: {} }, console);

    const result = await mod.exports.processChatbot('Tìm sách');
    expect(result.products.map((p) => p._id)).toEqual(['book']);
    expect(call).toBe(2);
  });
});
