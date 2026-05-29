window.scheduleDatabase = {
  campuses: [
    {
      id: "gwangjin",
      name: "광진캠퍼스",
      olympiadName: "광진캠퍼스",
      location: "서울특별시",
    },
    {
      id: "seongdong",
      name: "성동캠퍼스",
      olympiadName: "성동캠퍼스",
      location: "서울특별시",
    },
    {
      id: "dongdaemun",
      name: "동대문캠퍼스",
      olympiadName: "동대문캠퍼스",
      location: "서울특별시",
    },
    {
      id: "jungnang",
      name: "중랑캠퍼스",
      olympiadName: "중랑캠퍼스",
      location: "서울특별시",
    },
    {
      id: "songpa",
      name: "송파캠퍼스",
      olympiadName: "송파캠퍼스",
      location: "서울특별시",
    },
    {
      id: "junggye",
      name: "중계캠퍼스",
      olympiadName: "중계캠퍼스",
      location: "서울특별시",
    },
    {
      id: "misa",
      name: "미사캠퍼스",
      olympiadName: "미사캠퍼스",
      location: "경기도",
    },
  ],

  subjects: [
    {
      id: "math",
      name: "수학",
      olympiadName: "수학",
      campusIds: ["gwangjin", "seongdong", "dongdaemun", "jungnang", "songpa", "junggye", "misa"],
      unavailableSaturdayCampusIds: ["gwangjin"],
    },
    {
      id: "english",
      name: "영어",
      olympiadName: "영어",
      campusIds: ["gwangjin", "seongdong", "dongdaemun", "jungnang"],
      unavailableSaturdayCampusIds: [],
    },
    {
      id: "math_english",
      name: "수학+영어",
      olympiadName: "수학+영어",
      campusIds: ["gwangjin", "seongdong", "dongdaemun", "jungnang"],
      unavailableSaturdayCampusIds: [],
    },
  ],
};
