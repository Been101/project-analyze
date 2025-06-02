export const dataBehavior = Behavior({
  methods: {
    getData() {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve([1, 2, 3]);
        }, 1000);
      });
    },
  },
});

export const eventBehavior = Behavior({
  methods: {
    initEvent() {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve([1, 2, 3]);
        }, 1000);
      });
    },
  },
});
