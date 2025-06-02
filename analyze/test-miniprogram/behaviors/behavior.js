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
