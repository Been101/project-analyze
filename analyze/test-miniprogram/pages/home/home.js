import { dataBehavior } from "../../behaviors/behavior";

Page({
  data: {
    msg: "Hello Mini Program!",
  },
  onLoad() {
    console.log("Index page loaded");
  },
  behaviors: [dataBehavior],
  methods: {
    handleTap() {
      console.log("点击了按钮");
    },
    getList() {
      return this.getData();
    },
  },
});
