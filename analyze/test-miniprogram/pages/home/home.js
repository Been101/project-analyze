import { dataBehavior, eventBehavior } from "../../behaviors/behavior";

Page({
  data: {
    msg: "Hello Mini Program!",
  },
  onLoad() {
    console.log("Index page loaded");
    this.initEvent();
  },
  behaviors: [dataBehavior, eventBehavior],
  methods: {
    handleTap() {
      console.log("点击了按钮");
    },
    getList() {
      return this.getData();
    },
  },
});
